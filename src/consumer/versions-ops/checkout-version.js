// @flow
import path from 'path';
import fs from 'fs-extra';
import { BitId } from '../../bit-id';
import { Consumer } from '..';
import Component from '../component';
import { COMPONENT_ORIGINS } from '../../constants';
import { pathNormalizeToLinux } from '../../utils/path';
import type { PathOsBased } from '../../utils/path';
import Version from '../../scope/models/version';
import { SourceFile } from '../component/sources';
import {
  getMergeStrategyInteractive,
  FileStatus,
  MergeOptions,
  threeWayMerge,
  filesStatusWithoutSharedDir
} from './merge-version';
import type { MergeStrategy, ApplyVersionResults, ApplyVersionResult, FailedComponents } from './merge-version';
import type { MergeResultsThreeWay } from './merge-version/three-way-merge';
import GeneralError from '../../error/general-error';
import writeComponents from '../component-ops/write-components';

export type CheckoutProps = {
  version?: string, // if reset is true, the version is undefined
  ids?: BitId[],
  latestVersion?: boolean,
  promptMergeOptions: boolean,
  mergeStrategy: ?MergeStrategy,
  verbose: boolean,
  skipNpmInstall: boolean,
  reset: boolean, // remove local changes. if set, the version is undefined.
  all: boolean, // checkout all ids
  ignoreDist: boolean
};
type ComponentStatus = {
  componentFromFS?: Component,
  componentFromModel?: Component,
  id: BitId,
  failureMessage?: string,
  mergeResults?: ?MergeResultsThreeWay
};

export default (async function checkoutVersion(
  consumer: Consumer,
  checkoutProps: CheckoutProps
): Promise<ApplyVersionResults> {
  const { version, ids, promptMergeOptions } = checkoutProps;
  const { components } = await consumer.loadComponents(ids);
  const allComponentsP = components.map((component: Component) => {
    return getComponentStatus(consumer, component, checkoutProps);
  });
  const allComponents: ComponentStatus[] = await Promise.all(allComponentsP);
  const componentWithConflict = allComponents.find(
    component => component.mergeResults && component.mergeResults.hasConflicts
  );
  if (componentWithConflict) {
    if (!promptMergeOptions && !checkoutProps.mergeStrategy) {
      throw new GeneralError(
        `automatic merge has failed for component ${componentWithConflict.id.toStringWithoutVersion()}.\nplease use "--manual" to manually merge changes or use "--theirs / --ours" to choose one of the conflicted versions`
      );
    }
    if (!checkoutProps.mergeStrategy) checkoutProps.mergeStrategy = await getMergeStrategyInteractive();
  }
  const failedComponents: FailedComponents[] = allComponents
    .filter(componentStatus => componentStatus.failureMessage) // $FlowFixMe componentStatus.failureMessage is set
    .map(componentStatus => ({ id: componentStatus.id, failureMessage: componentStatus.failureMessage }));
  const componentsResultsP = allComponents
    .filter(componentStatus => !componentStatus.failureMessage)
    .map(({ id, componentFromFS, mergeResults }) => {
      return applyVersion(consumer, id, componentFromFS, mergeResults, checkoutProps);
    });
  const componentsResults = await Promise.all(componentsResultsP);

  return { components: componentsResults, version, failedComponents };
});

async function getComponentStatus(
  consumer: Consumer,
  component: Component,
  checkoutProps: CheckoutProps
): Promise<ComponentStatus> {
  const { version, latestVersion, reset } = checkoutProps;
  const componentModel = await consumer.scope.getModelComponentIfExist(component.id);
  const componentStatus: ComponentStatus = { id: component.id };
  const returnFailure = (msg: string) => {
    componentStatus.failureMessage = msg;
    return componentStatus;
  };
  if (!componentModel) {
    return returnFailure(`component ${component.id.toString()} doesn't have any version yet`);
  }
  const getNewVersion = (): string => {
    if (reset) return component.id.version;
    // $FlowFixMe if !reset the version is defined
    return latestVersion ? componentModel.latest() : version;
  };
  const newVersion = getNewVersion();
  if (version && !latestVersion && !componentModel.hasVersion(version)) {
    return returnFailure(`component ${component.id.toStringWithoutVersion()} doesn't have version ${version}`);
  }
  const existingBitMapId = consumer.bitMap.getExistingComponentId(component.id.toStringWithoutVersion());
  const currentlyUsedVersion = BitId.parse(existingBitMapId).version;
  if (version && currentlyUsedVersion === version) {
    // it won't be relevant for 'reset' as it doesn't have a version
    return returnFailure(`component ${component.id.toStringWithoutVersion()} is already at version ${version}`);
  }
  if (latestVersion && currentlyUsedVersion === newVersion) {
    return returnFailure(
      `component ${component.id.toStringWithoutVersion()} is already at the latest version, which is ${newVersion}`
    );
  }
  const baseComponent: Version = await componentModel.loadVersion(currentlyUsedVersion, consumer.scope.objects);
  const isModified = await consumer.isComponentModified(baseComponent, component);
  if (!isModified && reset) {
    return returnFailure(`component ${component.id.toStringWithoutVersion()} is not modified`);
  }
  let mergeResults: ?MergeResultsThreeWay;
  if (isModified && version) {
    const currentComponent: Version = await componentModel.loadVersion(newVersion, consumer.scope.objects);
    mergeResults = await threeWayMerge({
      consumer,
      otherComponent: component,
      otherVersion: currentlyUsedVersion,
      currentComponent,
      currentVersion: newVersion,
      baseComponent
    });
  }
  const versionRef = componentModel.versions[newVersion];
  const componentVersion = await consumer.scope.getObject(versionRef.hash);
  const newId = component.id.clone();
  newId.version = newVersion;
  return { componentFromFS: component, componentFromModel: componentVersion, id: newId, mergeResults };
}

/**
 * 1) when the files are modified with conflicts and the strategy is "ours", leave the FS as is
 * and update only bitmap id version. (not the componentMap object).
 *
 * 2) when the files are modified with conflicts and the strategy is "theirs", write the component
 * according to id.version.
 *
 * 3) when files are modified with no conflict or files are modified with conflicts and the
 * strategy is manual, load the component according to id.version and update component.files.
 * applyModifiedVersion() docs explains what files are updated/added.
 *
 * 4) when --reset flag is used, write the component according to the bitmap version
 *
 * Side note:
 * Deleted file => if files are in used version but not in the modified one, no need to delete it. (similar to git).
 * Added file => if files are not in used version but in the modified one, they'll be under mergeResults.addFiles
 */
async function applyVersion(
  consumer: Consumer,
  id: BitId,
  componentFromFS: Component,
  mergeResults: ?MergeResultsThreeWay,
  checkoutProps: CheckoutProps
): Promise<ApplyVersionResult> {
  const { mergeStrategy, verbose, skipNpmInstall, ignoreDist } = checkoutProps;
  const filesStatus = {};
  if (mergeResults && mergeResults.hasConflicts && mergeStrategy === MergeOptions.ours) {
    componentFromFS.files.forEach((file) => {
      filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.unchanged;
    });
    consumer.bitMap.updateComponentId(id);
    consumer.bitMap.hasChanged = true;
    return { id, filesStatus };
  }
  const componentsWithDependencies = await consumer.scope.getMany([id]);
  const componentWithDependencies = componentsWithDependencies[0];
  const componentMap = componentFromFS.componentMap;
  if (!componentMap) throw new GeneralError('applyVersion: componentMap was not found');
  if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED && !id.scope) {
    componentWithDependencies.dependencies = [];
    componentWithDependencies.devDependencies = [];
    componentWithDependencies.allDependencies = [];
  }
  const rootDir = componentMap.rootDir;
  const shouldWritePackageJson = async (): Promise<boolean> => {
    if (!rootDir) return false;
    const packageJsonPath = path.join(consumer.getPath(), rootDir, 'package.json');
    return fs.exists(packageJsonPath);
  };
  const shouldInstallNpmPackages = (): boolean => {
    if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED) return false;
    return !skipNpmInstall;
  };
  const writePackageJson = await shouldWritePackageJson();

  const files = componentWithDependencies.component.files;
  files.forEach((file) => {
    filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.updated;
  });

  let modifiedStatus = {};
  if (mergeResults) {
    // update files according to the merge results
    modifiedStatus = await applyModifiedVersion(files, mergeResults, mergeStrategy);
  }

  await writeComponents({
    consumer,
    componentsWithDependencies,
    installNpmPackages: shouldInstallNpmPackages(),
    override: true,
    writeBitJson: !!componentFromFS.bitJson, // write bit.json only if it was there before
    verbose,
    writeDists: !ignoreDist,
    writePackageJson
  });

  const filesStatusNoSharedDir = filesStatusWithoutSharedDir(
    filesStatus,
    componentWithDependencies.component,
    componentMap
  );
  const modifiedStatusNoSharedDir = filesStatusWithoutSharedDir(
    modifiedStatus,
    componentWithDependencies.component,
    componentMap
  );

  return { id, filesStatus: Object.assign(filesStatusNoSharedDir, modifiedStatusNoSharedDir) };
}

/**
 * relevant only when
 * 1) there is no conflict => add files from mergeResults: addFiles, overrideFiles and modifiedFiles.output.
 * 2) there is conflict and mergeStrategy is manual => add files from mergeResults: addFiles, overrideFiles and modifiedFiles.conflict.
 */
export async function applyModifiedVersion(
  componentFiles: SourceFile[],
  mergeResults: MergeResultsThreeWay,
  mergeStrategy: ?MergeStrategy
): Promise<Object> {
  const filesStatus = {};
  if (mergeResults.hasConflicts && mergeStrategy !== MergeOptions.manual) return filesStatus;
  const modifiedP = mergeResults.modifiedFiles.map(async (file) => {
    const filePath: PathOsBased = path.normalize(file.filePath);
    const foundFile = componentFiles.find(componentFile => componentFile.relative === filePath);
    if (!foundFile) throw new GeneralError(`file ${filePath} not found`);
    if (file.conflict) {
      foundFile.contents = Buffer.from(file.conflict);
      filesStatus[file.filePath] = FileStatus.manual;
    } else if (file.output) {
      foundFile.contents = Buffer.from(file.output);
      filesStatus[file.filePath] = FileStatus.merged;
    } else {
      throw new GeneralError('file does not have output nor conflict');
    }
  });
  const addFilesP = mergeResults.addFiles.map(async (file) => {
    componentFiles.push(file.fsFile);
    filesStatus[file.filePath] = FileStatus.added;
  });
  const overrideFilesP = mergeResults.overrideFiles.map(async (file) => {
    const filePath: PathOsBased = path.normalize(file.filePath);
    const foundFile = componentFiles.find(componentFile => componentFile.relative === filePath);
    if (!foundFile) throw new GeneralError(`file ${filePath} not found`);
    foundFile.contents = file.fsFile.contents;
    filesStatus[file.filePath] = FileStatus.overridden;
  });
  await Promise.all([Promise.all(modifiedP), Promise.all(addFilesP), Promise.all(overrideFilesP)]);

  return filesStatus;
}
