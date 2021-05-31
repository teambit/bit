import { compact } from 'lodash';
import mapSeries from 'p-map-series';
import * as path from 'path';

import { Consumer } from '..';
import { BitId } from '../../bit-id';
import { COMPONENT_ORIGINS } from '../../constants';
import GeneralError from '../../error/general-error';
import { ComponentWithDependencies } from '../../scope';
import Version from '../../scope/models/version';
import { Tmp } from '../../scope/repositories';
import { pathNormalizeToLinux, PathOsBased } from '../../utils/path';
import ConsumerComponent from '../component';
import ManyComponentsWriter from '../component-ops/many-components-writer';
import { SourceFile } from '../component/sources';
import DataToPersist from '../component/sources/data-to-persist';
import RemovePath from '../component/sources/remove-path';
import {
  ApplyVersionResult,
  ApplyVersionResults,
  FailedComponents,
  FileStatus,
  getMergeStrategyInteractive,
  MergeOptions,
  MergeStrategy,
  threeWayMerge,
} from './merge-version';
import { MergeResultsThreeWay } from './merge-version/three-way-merge';

export type CheckoutProps = {
  version?: string; // if reset is true, the version is undefined
  ids?: BitId[];
  latestVersion?: boolean;
  promptMergeOptions: boolean;
  mergeStrategy: MergeStrategy | null | undefined;
  verbose: boolean;
  skipNpmInstall: boolean;
  ignorePackageJson: boolean;
  writeConfig: boolean;
  reset: boolean; // remove local changes. if set, the version is undefined.
  all: boolean; // checkout all ids
  ignoreDist: boolean;
  isLane: boolean;
};
export type ComponentStatus = {
  componentFromFS?: ConsumerComponent;
  componentFromModel?: Version;
  id: BitId;
  failureMessage?: string;
  unchangedLegitimately?: boolean; // failed to checkout but for a legitimate reason, such as, up-to-date
  mergeResults?: MergeResultsThreeWay | null | undefined;
};

type ApplyVersionWithComps = { applyVersionResult: ApplyVersionResult; component?: ComponentWithDependencies };

export default async function checkoutVersion(
  consumer: Consumer,
  checkoutProps: CheckoutProps
): Promise<ApplyVersionResults> {
  const { version, ids, promptMergeOptions } = checkoutProps;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const { components } = await consumer.loadComponents(ids);
  const allComponentsStatus: ComponentStatus[] = await getAllComponentsStatus();
  const componentWithConflict = allComponentsStatus.find(
    (component) => component.mergeResults && component.mergeResults.hasConflicts
  );
  if (componentWithConflict) {
    if (!promptMergeOptions && !checkoutProps.mergeStrategy) {
      throw new GeneralError(
        `automatic merge has failed for component ${componentWithConflict.id.toStringWithoutVersion()}.\nplease use "--manual" to manually merge changes or use "--theirs / --ours" to choose one of the conflicted versions`
      );
    }
    if (!checkoutProps.mergeStrategy) checkoutProps.mergeStrategy = await getMergeStrategyInteractive();
  }
  const failedComponents: FailedComponents[] = allComponentsStatus
    .filter((componentStatus) => componentStatus.failureMessage)
    .map((componentStatus) => ({
      id: componentStatus.id,
      failureMessage: componentStatus.failureMessage as string,
      unchangedLegitimately: componentStatus.unchangedLegitimately,
    }));

  const succeededComponents = allComponentsStatus.filter((componentStatus) => !componentStatus.failureMessage);
  // do not use Promise.all for applyVersion. otherwise, it'll write all components in parallel,
  // which can be an issue when some components are also dependencies of others
  const componentsResults = await mapSeries(succeededComponents, ({ id, componentFromFS, mergeResults }) => {
    return applyVersion(consumer, id, componentFromFS, mergeResults, checkoutProps);
  });

  const componentsWithDependencies = componentsResults
    .map((c) => c.component)
    .filter((c) => c) as ComponentWithDependencies[];

  if (componentsWithDependencies.length) {
    const manyComponentsWriter = new ManyComponentsWriter({
      consumer,
      componentsWithDependencies,
      installNpmPackages: !checkoutProps.skipNpmInstall,
      override: true,
      verbose: checkoutProps.verbose,
      writeDists: !checkoutProps.ignoreDist,
      writeConfig: checkoutProps.writeConfig,
      writePackageJson: !checkoutProps.ignorePackageJson,
    });
    await manyComponentsWriter.writeAll();
    await deleteFilesIfNeeded(componentsResults, consumer);
  }

  const appliedVersionComponents = componentsResults.map((c) => c.applyVersionResult);

  return { components: appliedVersionComponents, version, failedComponents };

  async function getAllComponentsStatus(): Promise<ComponentStatus[]> {
    const tmp = new Tmp(consumer.scope);
    try {
      const componentsStatusP = components.map((component) => getComponentStatus(consumer, component, checkoutProps));
      const componentsStatus = await Promise.all(componentsStatusP);
      await tmp.clear();
      return componentsStatus;
    } catch (err) {
      await tmp.clear();
      throw err;
    }
  }
}

async function getComponentStatus(
  consumer: Consumer,
  component: ConsumerComponent,
  checkoutProps: CheckoutProps
): Promise<ComponentStatus> {
  const { version, latestVersion, reset } = checkoutProps;
  const componentModel = await consumer.scope.getModelComponentIfExist(component.id);
  const componentStatus: ComponentStatus = { id: component.id };
  const returnFailure = (msg: string, unchangedLegitimately = false) => {
    componentStatus.failureMessage = msg;
    componentStatus.unchangedLegitimately = unchangedLegitimately;
    return componentStatus;
  };
  if (!componentModel) {
    return returnFailure(`component ${component.id.toString()} doesn't have any version yet`);
  }
  const unmerged = consumer.scope.objects.unmergedComponents.getEntry(component.name);
  if (!reset && unmerged && unmerged.resolved === false) {
    return returnFailure(
      `component ${component.id.toStringWithoutVersion()} has conflicts that need to be resolved first, please use bit merge --resolve/--abort`
    );
  }
  const getNewVersion = (): string => {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (reset) return component.id.version;
    // $FlowFixMe if !reset the version is defined
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return latestVersion ? componentModel.latest() : version;
  };
  const newVersion = getNewVersion();
  if (version && !latestVersion) {
    const hasVersion = await componentModel.hasVersion(version, consumer.scope.objects);
    if (!hasVersion)
      return returnFailure(`component ${component.id.toStringWithoutVersion()} doesn't have version ${version}`);
  }
  const existingBitMapId = consumer.bitMap.getBitId(component.id, { ignoreVersion: true });
  const currentlyUsedVersion = existingBitMapId.version;
  if (version && currentlyUsedVersion === version) {
    // it won't be relevant for 'reset' as it doesn't have a version
    return returnFailure(`component ${component.id.toStringWithoutVersion()} is already at version ${version}`);
  }
  if (latestVersion && currentlyUsedVersion === newVersion) {
    return returnFailure(
      `component ${component.id.toStringWithoutVersion()} is already at the latest version, which is ${newVersion}`,
      true
    );
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const baseComponent: Version = await componentModel.loadVersion(currentlyUsedVersion, consumer.scope.objects);
  const isModified = await consumer.isComponentModified(baseComponent, component);
  if (!isModified && reset) {
    return returnFailure(`component ${component.id.toStringWithoutVersion()} is not modified`);
  }
  let mergeResults: MergeResultsThreeWay | null | undefined;
  if (version) {
    const currentComponent: Version = await componentModel.loadVersion(newVersion, consumer.scope.objects);
    mergeResults = await threeWayMerge({
      consumer,
      otherComponent: component,
      otherLabel: `${currentlyUsedVersion} modified`,
      currentComponent,
      currentLabel: newVersion,
      baseComponent,
    });
  }
  const versionRef = componentModel.getRef(newVersion);
  // @ts-ignore
  const componentVersion = await consumer.scope.getObject(versionRef.hash);
  const newId = component.id.changeVersion(newVersion);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
export async function applyVersion(
  consumer: Consumer,
  id: BitId,
  componentFromFS: ConsumerComponent | null | undefined, // it can be null only when isLanes is true
  mergeResults: MergeResultsThreeWay | null | undefined,
  checkoutProps: CheckoutProps
): Promise<ApplyVersionWithComps> {
  if (!checkoutProps.isLane && !componentFromFS)
    throw new Error(`applyVersion expect to get componentFromFS for ${id.toString()}`);
  const { mergeStrategy } = checkoutProps;
  const filesStatus = {};
  if (mergeResults && mergeResults.hasConflicts && mergeStrategy === MergeOptions.ours) {
    // even when isLane is true, the mergeResults is possible only when the component is on the filesystem
    // otherwise it's impossible to have conflicts
    if (!componentFromFS) throw new Error(`applyVersion expect to get componentFromFS for ${id.toString()}`);
    componentFromFS.files.forEach((file) => {
      filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.unchanged;
    });
    consumer.bitMap.updateComponentId(id);
    return { applyVersionResult: { id, filesStatus } };
  }
  const componentWithDependencies = await consumer.loadComponentWithDependenciesFromModel(id);
  const componentMap = componentFromFS && componentFromFS.componentMap;
  if (componentFromFS && !componentMap) throw new GeneralError('applyVersion: componentMap was not found');
  if (componentMap && componentMap.origin === COMPONENT_ORIGINS.AUTHORED && !id.scope) {
    componentWithDependencies.dependencies = [];
    componentWithDependencies.devDependencies = [];
  }
  const files = componentWithDependencies.component.files;
  files.forEach((file) => {
    filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.updated;
  });
  let modifiedStatus = {};
  if (mergeResults) {
    // update files according to the merge results
    modifiedStatus = applyModifiedVersion(
      files,
      mergeResults,
      mergeStrategy,
      componentWithDependencies.component.originallySharedDir
    );
  }
  const shouldDependenciesSaveAsComponents = await consumer.shouldDependenciesSavedAsComponents([id]);
  componentWithDependencies.component.dependenciesSavedAsComponents =
    shouldDependenciesSaveAsComponents[0].saveDependenciesAsComponents;

  return {
    applyVersionResult: { id, filesStatus: Object.assign(filesStatus, modifiedStatus) },
    component: componentWithDependencies,
  };
}

/**
 * relevant only when
 * 1) there is no conflict => add files from mergeResults: addFiles, overrideFiles and modifiedFiles.output.
 * 2) there is conflict and mergeStrategy is manual => add files from mergeResults: addFiles, overrideFiles and modifiedFiles.conflict.
 *
 * this function only updates the files content, it doesn't write the files
 */
export function applyModifiedVersion(
  componentFiles: SourceFile[],
  mergeResults: MergeResultsThreeWay,
  mergeStrategy: MergeStrategy | null | undefined,
  sharedDir?: string
): Record<string, any> {
  const filesStatus = {};
  if (mergeResults.hasConflicts && mergeStrategy !== MergeOptions.manual) return filesStatus;
  mergeResults.modifiedFiles.forEach((file) => {
    const filePath: PathOsBased = path.normalize(file.filePath);
    const pathWithSharedDir = (p: string) => (sharedDir ? path.join(sharedDir, p) : p);
    const foundFile = componentFiles.find((componentFile) => pathWithSharedDir(componentFile.relative) === filePath);
    if (!foundFile) throw new GeneralError(`file ${filePath} not found`);
    if (file.conflict) {
      foundFile.contents = Buffer.from(file.conflict);
      filesStatus[file.filePath] = FileStatus.manual;
    } else if (file.output) {
      foundFile.contents = Buffer.from(file.output);
      filesStatus[file.filePath] = FileStatus.merged;
    } else {
      throw new GeneralError(`file ${filePath} does not have output nor conflict`);
    }
  });
  mergeResults.addFiles.forEach((file) => {
    componentFiles.push(file.fsFile);
    filesStatus[file.filePath] = FileStatus.added;
  });
  mergeResults.removeFiles.forEach((file) => {
    const filePath: PathOsBased = path.normalize(file.filePath);
    filesStatus[file.filePath] = FileStatus.removed;
    componentFiles = componentFiles.filter((f) => f.relative !== filePath);
  });
  mergeResults.overrideFiles.forEach((file) => {
    const filePath: PathOsBased = path.normalize(file.filePath);
    const foundFile = componentFiles.find((componentFile) => componentFile.relative === filePath);
    if (!foundFile) throw new GeneralError(`file ${filePath} not found`);
    foundFile.contents = file.fsFile.contents;
    filesStatus[file.filePath] = FileStatus.overridden;
  });

  return filesStatus;
}

async function deleteFilesIfNeeded(componentsResults: ApplyVersionWithComps[], consumer: Consumer): Promise<void> {
  const pathsToRemoveIncludeNull = componentsResults.map((compResult) => {
    return Object.keys(compResult.applyVersionResult.filesStatus).map((filePath) => {
      if (compResult.applyVersionResult.filesStatus[filePath] === FileStatus.removed) {
        if (!compResult.component?.component.writtenPath) return null;
        return path.join(compResult.component?.component.writtenPath, filePath);
      }
      return null;
    });
  });
  const pathsToRemove = compact(pathsToRemoveIncludeNull.flat());
  const dataToPersist = new DataToPersist();
  dataToPersist.removeManyPaths(pathsToRemove.map((p) => new RemovePath(p, true)));
  dataToPersist.addBasePath(consumer.getPath());
  await dataToPersist.persistAllToFS();
}
