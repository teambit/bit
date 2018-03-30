// @flow
import path from 'path';
import fs from 'fs-extra';
import { BitId } from '../../bit-id';
import { Consumer } from '..';
import Component from './consumer-component';
import { threeWayMergeVersions, twoWayMergeVersions } from '../merge-versions/merge-versions';
import type { MergeResults, MergeResultsTwoWay } from '../merge-versions/merge-versions';
import { resolveConflictPrompt } from '../../prompts';
import { COMPONENT_ORIGINS } from '../../constants';
import { pathNormalizeToLinux } from '../../utils/path';
import type { PathLinux } from '../../utils/path';
import { SourceFile } from './sources';
import Version from '../../scope/models/version';
import type { SourceFileModel } from '../../scope/models/version';

export type UseProps = {
  version: string,
  ids: BitId[],
  promptMergeOptions: boolean,
  mergeStrategy: ?MergeStrategy,
  verbose: boolean,
  skipNpmInstall: boolean,
  ignoreDist: boolean
};

type ComponentFromFSAndModel = {
  componentFromFS: Component,
  componentFromModel: Component,
  id: BitId,
  mergeResults: ?MergeResults
};
const mergeOptionsCli = { o: 'ours', t: 'theirs', m: 'manual' };
export const MergeOptions = { ours: 'ours', theirs: 'theirs', manual: 'manual' };
export type MergeStrategy = $Keys<typeof MergeOptions>;
export const FileStatus = {
  merged: 'file has successfully merged',
  manual: 'file has conflicts which needs to be resolved manually',
  updated: 'file has been updated',
  added: 'file has been added',
  overridden: 'file has been overridden',
  unchanged: 'file left intact'
};
export type ApplyVersionResult = { id: BitId, filesStatus: { [fileName: PathLinux]: $Values<typeof FileStatus> } };
export type SwitchVersionResults = { components: ApplyVersionResult[], version: string };

export async function switchVersion(consumer: Consumer, useProps: UseProps): Promise<SwitchVersionResults> {
  const { version, ids, promptMergeOptions } = useProps;
  const { components } = await consumer.loadComponents(ids);
  const allComponentsP = components.map((component: Component) => {
    return getComponentInstances(consumer, component, version);
  });
  const allComponents = await Promise.all(allComponentsP);
  const componentWithConflict = allComponents.find(
    component => component.mergeResults && component.mergeResults.hasConflicts
  );
  if (componentWithConflict) {
    if (!promptMergeOptions && !useProps.mergeStrategy) {
      throw new Error(
        `component ${componentWithConflict.id.toStringWithoutVersion()} is modified, merging the changes will result in a conflict state, to merge the component use --merge flag`
      );
    }
    if (!useProps.mergeStrategy) useProps.mergeStrategy = await getMergeStrategy();
  }
  const componentsResultsP = allComponents.map(({ id, componentFromFS, mergeResults }) => {
    return applyVersion(consumer, id, componentFromFS, mergeResults, useProps);
  });
  const componentsResults = await Promise.all(componentsResultsP);
  if (consumer.bitMap.hasChanged) await consumer.bitMap.write();

  return { components: componentsResults, version };
}

export async function switchVersionForMerge(consumer: Consumer, useProps: UseProps): Promise<SwitchVersionResults> {
  const { version, ids } = useProps;
  const { components } = await consumer.loadComponents(ids);
  const allComponentsP = components.map((component: Component) => {
    return getComponentInstancesForMerge(consumer, component, version);
  });
  const allComponents = await Promise.all(allComponentsP);
  const componentWithConflict = allComponents.find(
    component => component.mergeResults && component.mergeResults.hasConflicts
  );
  if (componentWithConflict && !useProps.mergeStrategy) {
    useProps.mergeStrategy = await getMergeStrategy();
  }
  const componentsResultsP = allComponents.map(({ id, componentFromFS, mergeResults }) => {
    return applyVersionForMerge(consumer, id, componentFromFS, mergeResults, useProps);
  });
  const componentsResults = await Promise.all(componentsResultsP);
  await consumer.bitMap.write();

  return { components: componentsResults, version };
}

async function getComponentInstancesForMerge(consumer: Consumer, component: Component, version: string): Promise<any> {
  const componentModel = await consumer.scope.sources.get(component.id);
  if (!componentModel) {
    throw new Error(`component ${component.id.toString()} doesn't have any version yet`);
  }
  if (!componentModel.hasVersion(version)) {
    throw new Error(`component ${component.id.toStringWithoutVersion()} doesn't have version ${version}`);
  }
  const existingBitMapId = consumer.bitMap.getExistingComponentId(component.id.toStringWithoutVersion());
  const currentlyUsedVersion = BitId.parse(existingBitMapId).version;
  if (currentlyUsedVersion === version) {
    throw new Error(`component ${component.id.toStringWithoutVersion()} is already at ${version} version`);
  }
  const otherComponent: Version = await componentModel.loadVersion(version, consumer.scope.objects);
  const mergeResults: ?MergeResultsTwoWay = await twoWayMergeVersions({
    consumer,
    otherComponent,
    otherVersion: version,
    currentComponent: component,
    currentVersion: currentlyUsedVersion
  });
  return { componentFromFS: component, id: component.id, mergeResults };
}

async function getComponentInstances(
  consumer: Consumer,
  component: Component,
  version: string
): Promise<ComponentFromFSAndModel> {
  const componentModel = await consumer.scope.sources.get(component.id);
  if (!componentModel) {
    throw new Error(`component ${component.id.toString()} doesn't have any version yet`);
  }
  if (!componentModel.hasVersion(version)) {
    throw new Error(`component ${component.id.toStringWithoutVersion()} doesn't have version ${version}`);
  }
  const existingBitMapId = consumer.bitMap.getExistingComponentId(component.id.toStringWithoutVersion());
  const currentlyUsedVersion = BitId.parse(existingBitMapId).version;
  if (currentlyUsedVersion === version) {
    throw new Error(`component ${component.id.toStringWithoutVersion()} is already at ${version} version`);
  }
  const baseComponent: Version = await componentModel.loadVersion(currentlyUsedVersion, consumer.scope.objects);
  const isModified = await consumer.isComponentModified(baseComponent, component);
  let mergeResults: ?MergeResults;
  if (isModified) {
    const currentComponent: Version = await componentModel.loadVersion(version, consumer.scope.objects);
    mergeResults = await threeWayMergeVersions({
      consumer,
      otherComponent: component,
      otherVersion: currentlyUsedVersion,
      currentComponent,
      currentVersion: version,
      baseComponent
    });
  }
  const versionRef = componentModel.versions[version];
  const componentVersion = await consumer.scope.getObject(versionRef.hash);
  const newId = component.id.clone();
  newId.version = version;
  return { componentFromFS: component, componentFromModel: componentVersion, id: newId, mergeResults };
}

async function getMergeStrategy(): Promise<MergeStrategy> {
  try {
    const result = await resolveConflictPrompt();
    return mergeOptionsCli[result.mergeStrategy];
  } catch (err) {
    // probably user clicked ^C
    throw new Error('the action has been canceled');
  }
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
 * Side note:
 * Deleted file => if files are in used version but not in the modified one, no need to delete it. (similar to git).
 * Added file => if files are not in used version but in the modified one, they'll be under mergeResults.addFiles
 */
async function applyVersion(
  consumer: Consumer,
  id: BitId,
  componentFromFS: Component,
  mergeResults: ?MergeResults,
  useProps: UseProps
): Promise<ApplyVersionResult> {
  const { mergeStrategy, verbose, skipNpmInstall, ignoreDist } = useProps;
  const filesStatus = {};
  if (mergeResults && mergeResults.hasConflicts && mergeStrategy === MergeOptions.ours) {
    // $FlowFixMe componentFromFS.files can't be empty
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
  if (!componentMap) throw new Error('applyVersion: componentMap was not found');
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

  await consumer.writeToComponentsDir({
    componentsWithDependencies,
    installNpmPackages: shouldInstallNpmPackages(),
    force: true,
    writeBitJson: !!componentFromFS.bitJson, // write bit.json only if it was there before
    verbose,
    writeDists: !ignoreDist,
    writePackageJson
  });

  return { id, filesStatus: Object.assign(filesStatus, modifiedStatus) };
}

/**
 * Generally, it doesn't matter whether the component is modified. The idea is to merge the
 * specified version with the current version.
 *
 * 1) when there are conflicts and the strategy is "ours", don't do any change to the component.
 *
 * 2) when there are conflicts and the strategy is "theirs", add all files from the specified
 * version and write the component.
 *
 * 3) when there is no conflict or there are conflicts and the strategy is manual, update
 * component.files.
 *
 * it's going to be 2-way merge:
 * current-file: is the current file.
 * base-file: empty.
 * other-file: the specified version.
 */
async function applyVersionForMerge(
  consumer: Consumer,
  id: BitId,
  componentFromFS: Component,
  mergeResults: MergeResultsTwoWay,
  useProps: UseProps
): Promise<ApplyVersionResult> {
  const { mergeStrategy } = useProps;
  const filesStatus = {};
  if (mergeResults.hasConflicts && mergeStrategy === MergeOptions.ours) {
    // $FlowFixMe componentFromFS.files can't be empty
    componentFromFS.files.forEach((file) => {
      filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.unchanged;
    });
    return { id, filesStatus };
  }
  const component = componentFromFS.componentFromModel;
  if (!component) throw new Error('failing finding the component in the model');
  const componentMap = componentFromFS.componentMap;
  if (!componentMap) throw new Error('applyVersion: componentMap was not found');
  const files = componentFromFS.cloneFilesWithSharedDir();
  component.files = files;

  files.forEach((file) => {
    filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.unchanged;
  });

  // update files according to the merge results
  const modifiedStatus = await applyModifiedVersionForMerge(consumer, files, mergeResults, mergeStrategy);

  if (componentMap.origin === COMPONENT_ORIGINS.IMPORTED) {
    component.originallySharedDir = componentMap.originallySharedDir || null;
    component.stripOriginallySharedDir(consumer.bitMap);
  }

  await component.write({
    force: true,
    writeBitJson: false, // never override the existing bit.json
    writePackageJson: false,
    deleteBitDirContent: false,
    origin: componentMap.origin,
    consumer,
    componentMap
  });

  consumer.bitMap.removeComponent(component.id);
  component._addComponentToBitMap(consumer.bitMap, componentMap.rootDir, componentMap.origin);

  return { id, filesStatus: Object.assign(filesStatus, modifiedStatus) };
}

/**
 * relevant when
 * 1) there is no conflict => add files from mergeResults: addFiles, overrideFiles and modifiedFiles.output.
 * 2) there is conflict and mergeStrategy is manual => add files from mergeResults: addFiles, overrideFiles and modifiedFiles.conflict.
 */
async function applyModifiedVersionForMerge(
  consumer: Consumer,
  componentFiles: SourceFile[],
  mergeResults: MergeResultsTwoWay,
  mergeStrategy: ?MergeStrategy
): Promise<Object> {
  const filesStatus = {};
  const modifiedP = mergeResults.modifiedFiles.map(async (file) => {
    const foundFile = componentFiles.find(componentFile => componentFile.relative === file.filePath);
    if (!foundFile) throw new Error(`file ${file.filePath} not found`);
    if (mergeResults.hasConflicts && mergeStrategy === MergeOptions.theirs) {
      // write the version of otherFile
      const otherFile: SourceFileModel = file.otherFile;
      const content = await otherFile.file.load(consumer.scope.objects);
      foundFile.contents = content.contents;
      filesStatus[file.filePath] = FileStatus.updated;
    } else if (file.conflict) {
      foundFile.contents = new Buffer(file.conflict);
      filesStatus[file.filePath] = FileStatus.manual;
    } else if (file.output) {
      foundFile.contents = new Buffer(file.output);
      filesStatus[file.filePath] = FileStatus.merged;
    } else {
      throw new Error('file does not have output nor conflict');
    }
  });
  const addFilesP = mergeResults.addFiles.map(async (file) => {
    const otherFile: SourceFileModel = file.otherFile;
    const newFile = await SourceFile.loadFromSourceFileModel(otherFile, consumer.scope.objects);
    componentFiles.push(newFile);
    filesStatus[file.filePath] = FileStatus.added;
  });

  await Promise.all([Promise.all(modifiedP), Promise.all(addFilesP)]);

  return filesStatus;
}

/**
 * relevant only when
 * 1) there is no conflict => add files from mergeResults: addFiles, overrideFiles and modifiedFiles.output.
 * 2) there is conflict and mergeStrategy is manual => add files from mergeResults: addFiles, overrideFiles and modifiedFiles.conflict.
 */
async function applyModifiedVersion(
  componentFiles: SourceFile[],
  mergeResults: MergeResults,
  mergeStrategy: ?MergeStrategy
): Promise<Object> {
  const filesStatus = {};
  if (mergeResults.hasConflicts && mergeStrategy !== MergeOptions.manual) return filesStatus;
  const modifiedP = mergeResults.modifiedFiles.map(async (file) => {
    const foundFile = componentFiles.find(componentFile => componentFile.relative === file.filePath);
    if (!foundFile) throw new Error(`file ${file.filePath} not found`);
    if (file.conflict) {
      foundFile.contents = new Buffer(file.conflict);
      filesStatus[file.filePath] = FileStatus.manual;
    } else if (file.output) {
      foundFile.contents = new Buffer(file.output);
      filesStatus[file.filePath] = FileStatus.merged;
    } else {
      throw new Error('file does not have output nor conflict');
    }
  });
  const addFilesP = mergeResults.addFiles.map(async (file) => {
    componentFiles.push(file.fsFile);
    filesStatus[file.filePath] = FileStatus.added;
  });
  const overrideFilesP = mergeResults.overrideFiles.map(async (file) => {
    const foundFile = componentFiles.find(componentFile => componentFile.relative === file.filePath);
    if (!foundFile) throw new Error(`file ${file.filePath} not found`);
    foundFile.contents = file.fsFile.contents;
    filesStatus[file.filePath] = FileStatus.overridden;
  });
  await Promise.all([Promise.all(modifiedP), Promise.all(addFilesP), Promise.all(overrideFilesP)]);

  return filesStatus;
}
