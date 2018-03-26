// @flow
import { BitId } from '../../bit-id';
import { Consumer } from '..';
import Component from './consumer-component';
import mergeVersions from '../merge-versions/merge-versions';
import type { MergeResults } from '../merge-versions/merge-versions';
import { resolveConflictPrompt } from '../../prompts';
import ComponentMap from '../bit-map/component-map';

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
  merged: 'file has successfully merged the modification with the used version',
  manual: 'file has conflicts which needs to be resolved manually',
  updated: 'file has been updated according to the used version',
  added: 'file has been added to the used version',
  overridden: 'the used version has been overridden by the current modification',
  unchanged: 'file left intact'
};
export type ApplyVersionResult = { id: BitId, filesStatus: { [fileName: string]: $Values<typeof FileStatus> } };
export type SwitchVersionResults = { components: ApplyVersionResult[], version: string };

export default (async function switchVersion(consumer: Consumer, useProps: UseProps): Promise<SwitchVersionResults> {
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
});

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
    throw new Error(`component ${component.id.toStringWithoutVersion()} uses ${version} already`);
  }
  const latestVersionFromModel = componentModel.latest();
  const latestVersionRef = componentModel.versions[latestVersionFromModel];
  const latestComponentVersion = await consumer.scope.getObject(latestVersionRef.hash);
  const isModified = await consumer.isComponentModified(latestComponentVersion, component);
  let mergeResults: ?MergeResults;
  if (isModified) {
    mergeResults = await mergeVersions({
      consumer,
      componentFromFS: component,
      modelComponent: componentModel,
      fsVersion: currentlyUsedVersion,
      currentVersion: version
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
 * in a case where a component @0.0.2 is switched to @0.0.1
 * previousComponentMap => componentMap of 0.0.2
 * newComponentMap      => componentMap of 0.0.1
 * newId                => 0.0.1
 */
function addFilesToBitMap(consumer: Consumer, previousComponentMap: ComponentMap, newId: BitId): void {
  const newComponentMap = consumer.bitMap.getComponent(newId);
  const files = consumer.bitMap.mergeFilesArray(newComponentMap.files, previousComponentMap.files);
  newComponentMap.files = files;
  consumer.bitMap.hasChanged = true;
}

/**
 * 1) write the component as the specified version.
 * an exception is when the files are modified with conflicts and the strategy is "our". (see #3.ours)
 *
 * 2) if modified with no conflict.
 * write from mergeResults: addFiles, overrideFiles and modifiedFiles.output.
 * also, add newly tracked files to bitmap.
 *
 * 3) if modified with conflict.
 * Theirs => don't do anything. the component is already written as the specified version.
 * Ours => leave the FS as is and update only bitmap id version. (not the componentMap object).
 * Manual => write from mergeResults: addFiles, overrideFiles and modifiedFiles.conflict. also, add newly tracked files to bitmap.
 *
 * Side note:
 * Deleted file => if files are in used version but not in the modified one, no need to delete it. (similar to git).
 * Added file => if files are not in used version but in the modified one, they'll be under mergeResults.addFiles
 */
async function applyVersion(
  consumer: Consumer,
  id: BitId,
  componentFromFS: Component,
  mergeResults: MergeResults,
  useProps: UseProps
): Promise<ApplyVersionResult> {
  const { mergeStrategy, verbose, skipNpmInstall, ignoreDist } = useProps;
  const filesStatus = {};
  if (mergeResults && mergeResults.hasConflicts && mergeStrategy === MergeOptions.ours) {
    // $FlowFixMe componentFromFS.files can't be empty
    componentFromFS.files.forEach((file) => {
      filesStatus[file.relative] = FileStatus.unchanged;
    });
    consumer.bitMap.updateComponentId(id);
    consumer.bitMap.hasChanged = true;
    return { id, filesStatus };
  }
  const componentsWithDependencies = await consumer.scope.getManyWithAllVersions([id]);
  await consumer.writeToComponentsDir({
    componentsWithDependencies,
    installNpmPackages: !!id.scope && !skipNpmInstall, // if there is no scope, the component wasn't exported yet, don't install npm packages.
    force: true,
    verbose,
    writeDists: !ignoreDist
  });
  componentsWithDependencies[0].component.files.forEach((file) => {
    filesStatus[file.relative] = FileStatus.updated;
  });

  let modifiedStatus = {};
  if (mergeResults) {
    modifiedStatus = await applyModifiedVersion(mergeResults, mergeStrategy);
    if (mergeResults.addFiles.length && mergeStrategy !== MergeOptions.theirs) {
      // $FlowFixMe componentMap does exist here
      addFilesToBitMap(consumer, componentFromFS.componentMap, id);
    }
  }
  return { id, filesStatus: Object.assign(filesStatus, modifiedStatus) };
}

async function applyModifiedVersion(mergeResults: MergeResults, mergeStrategy: ?MergeStrategy): Promise<Object> {
  const filesStatus = {};
  if (mergeResults.hasConflicts && mergeStrategy !== MergeOptions.manual) return filesStatus;
  const modifiedP = mergeResults.modifiedFiles.map(async (file) => {
    if (file.conflict) {
      file.fsFile.contents = new Buffer(file.conflict);
      filesStatus[file.filePath] = FileStatus.manual;
    } else if (file.output) {
      file.fsFile.contents = new Buffer(file.output);
      filesStatus[file.filePath] = FileStatus.merged;
    } else {
      throw new Error('file does not have output nor conflict');
    }
    await file.fsFile.write();
  });
  const addFilesP = mergeResults.addFiles.map(async (file) => {
    await file.fsFile.write();
    filesStatus[file.filePath] = FileStatus.added;
  });
  const overrideFilesP = mergeResults.overrideFiles.map(async (file) => {
    await file.fsFile.write();
    filesStatus[file.filePath] = FileStatus.overridden;
  });
  await Promise.all(modifiedP);
  await Promise.all(addFilesP);
  await Promise.all(overrideFilesP);

  return filesStatus;
}
