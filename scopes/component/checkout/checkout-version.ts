import * as path from 'path';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { ComponentID } from '@teambit/component-id';
import Version from '@teambit/legacy/dist/scope/models/version';
import { SourceFile, RemovePath, DataToPersist } from '@teambit/component.sources';
import { pathNormalizeToLinux, PathOsBased } from '@teambit/legacy.utils';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';
import {
  ApplyVersionResult,
  FilesStatus,
  FileStatus,
  MergeOptions,
  MergeStrategy,
  MergeResultsThreeWay,
} from '@teambit/merging';
import { CheckoutProps } from './checkout.main.runtime';

export type ComponentStatusBase = {
  currentComponent?: ConsumerComponent;
  componentFromModel?: Version;
  id: ComponentID;
  shouldBeRemoved?: boolean; // in case the component is soft-removed, it should be removed from the workspace
  unchangedMessage?: string; // this gets populated either upon skip or failure.
  unchangedLegitimately?: boolean; // true for skipped legitimately (e.g. already up to date). false for failure.
};

export type ComponentStatus = ComponentStatusBase & {
  mergeResults?: MergeResultsThreeWay | null | undefined;
};

export type ApplyVersionWithComps = {
  applyVersionResult: ApplyVersionResult;
  component?: ConsumerComponent;
  // in case the component needs to be written to the filesystem, this is the component to write.
  legacyCompToWrite?: ConsumerComponent;
};

/**
 * This function optionally returns "component" object. If it returns, it means it needs to be written to the filesystem.
 * Otherwise, it means the component is already up to date and no need to write it.
 *
 * If no need to change anything (ours), then don't return the component object.
 * Otherwise, either return the component object as is (if no conflicts or "theirs"), or change the files in this
 * component object. Later, this component object is written to the filesystem.
 *
 * 1) when the files are modified with conflicts and the strategy is "ours", or forceOurs was used, leave the FS as is.
 *
 * 2) when the files are modified with conflicts and the strategy is "theirs", or forceTheirs was used, write the
 * component according to "component" object
 *
 * 3) when files are modified with no conflict or files are modified with conflicts and the
 * strategy is manual, load the component according to id.version and update component.files.
 * applyModifiedVersion() docs explains what files are updated/added.
 *
 * Side note:
 * Deleted file => if files are in used version but not in the modified one, no need to delete it. (similar to git).
 * Added file => if files are not in used version but in the modified one, they'll be under mergeResults.addFiles
 */
export async function applyVersion(
  consumer: Consumer,
  id: ComponentID,
  componentFromFS: ConsumerComponent | null | undefined, // it can be null only when isLanes is true
  mergeResults: MergeResultsThreeWay | null | undefined,
  checkoutProps: CheckoutProps
): Promise<ApplyVersionWithComps> {
  if (!checkoutProps.isLane && !componentFromFS)
    throw new Error(`applyVersion expect to get componentFromFS for ${id.toString()}`);
  const { mergeStrategy, forceOurs } = checkoutProps;
  let filesStatus = {};
  if ((mergeResults?.hasConflicts && mergeStrategy === MergeOptions.ours) || forceOurs) {
    // even when isLane is true, the mergeResults is possible only when the component is on the filesystem
    // otherwise it's impossible to have conflicts
    if (!componentFromFS) throw new Error(`applyVersion expect to get componentFromFS for ${id.toString()}`);
    componentFromFS.files.forEach((file) => {
      filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.unchanged;
    });
    consumer.bitMap.updateComponentId(id);
    return { applyVersionResult: { id, filesStatus } };
  }
  const component = await consumer.loadComponentFromModelImportIfNeeded(id);
  const componentMap = componentFromFS && componentFromFS.componentMap;
  if (componentFromFS && !componentMap) throw new BitError('applyVersion: componentMap was not found');

  const files = component.files;
  updateFileStatus(files, filesStatus, componentFromFS || undefined);

  await removeFilesIfNeeded(filesStatus, consumer, componentFromFS || undefined);

  if (mergeResults) {
    // update files according to the merge results
    const { filesStatus: modifiedStatus, modifiedFiles } = applyModifiedVersion(files, mergeResults, mergeStrategy);
    filesStatus = { ...filesStatus, ...modifiedStatus };
    component.files = modifiedFiles;
  }

  // in case of forceTheirs, the mergeResults is undefined, the "component" object is according to "theirs", so it'll work
  // expected. (later, it writes the component object).

  return {
    applyVersionResult: { id, filesStatus },
    component,
  };
}

export function updateFileStatus(files: SourceFile[], filesStatus: FilesStatus, componentFromFS?: ConsumerComponent) {
  files.forEach((file) => {
    const fileFromFs = componentFromFS?.files.find((f) => f.relative === file.relative);
    // @ts-ignore should be fixed after upgrading @types/node from '12.20.4' to > 20
    const areFilesEqual = fileFromFs && Buffer.compare(fileFromFs.contents, file.contents) === 0;
    // @ts-ignore
    filesStatus[pathNormalizeToLinux(file.relative)] = areFilesEqual ? FileStatus.unchanged : FileStatus.updated;
  });
}

/**
 * when files exist on the filesystem but not on the checked out versions, they need to be deleted.
 * without this function, these files would be left on the filesystem. (we don't delete the comp-dir before writing).
 * this needs to be done *before* the component is written to the filesystem, otherwise, it won't work when a file
 * has a case change. e.g. from uppercase to lowercase. (see merge-lane.e2e 'renaming files from uppercase to lowercase').
 */
export async function removeFilesIfNeeded(
  filesStatus: FilesStatus,
  consumer: Consumer,
  componentFromFS?: ConsumerComponent
) {
  if (!componentFromFS) return;
  // @todo: if the component is not in the FS, it should be passed as undefined here.
  // in the case this is coming from merge-lane, it's sometimes populated from the scope.
  const isExistOnFs = consumer.bitMap.getComponentIdIfExist(componentFromFS.id, { ignoreVersion: true });
  if (!isExistOnFs) return;
  const filePathsFromFS = componentFromFS.files || [];
  const dataToPersist = new DataToPersist();
  filePathsFromFS.forEach((file) => {
    const filename = pathNormalizeToLinux(file.relative);
    if (!filesStatus[filename]) {
      // @ts-ignore todo: typescript has a good point here. it should be the string "removed", not chalk.green(removed).
      filesStatus[filename] = FileStatus.removed;
    }
    if (filesStatus[filename] === FileStatus.removed) {
      dataToPersist.removePath(new RemovePath(file.path));
    }
  });
  await dataToPersist.persistAllToFS();
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
  mergeStrategy: MergeStrategy | null | undefined
): { filesStatus: Record<string, any>; modifiedFiles: SourceFile[] } {
  let modifiedFiles = componentFiles.map((file) => file.clone());
  const filesStatus = {};
  if (mergeResults.hasConflicts && mergeStrategy !== MergeOptions.manual) {
    return { filesStatus, modifiedFiles };
  }
  mergeResults.modifiedFiles.forEach((file) => {
    const filePath: PathOsBased = path.normalize(file.filePath);
    const foundFile = modifiedFiles.find((componentFile) => componentFile.relative === filePath);
    if (!foundFile) throw new BitError(`file ${filePath} not found`);
    if (file.conflict) {
      foundFile.contents = Buffer.from(file.conflict);
      filesStatus[file.filePath] = FileStatus.manual;
    } else if (typeof file.output === 'string') {
      foundFile.contents = Buffer.from(file.output);
      filesStatus[file.filePath] = FileStatus.merged;
    } else if (file.isBinaryConflict) {
      // leave the file as is and notify the user later about it.
      foundFile.contents = file.fsFile.contents;
      filesStatus[file.filePath] = FileStatus.binaryConflict;
    } else {
      throw new BitError(`file ${filePath} does not have output nor conflict`);
    }
  });

  mergeResults.addFiles.forEach((file) => {
    const filePath: PathOsBased = path.normalize(file.filePath);
    if (modifiedFiles.find((m) => m.relative === filePath)) return;
    modifiedFiles.push(file.fsFile);
    filesStatus[file.filePath] = FileStatus.added;
  });
  mergeResults.deletedConflictFiles.forEach((file) => {
    if (!file.fsFile) return;
    const filePath: PathOsBased = path.normalize(file.filePath);
    if (modifiedFiles.find((m) => m.relative === filePath)) return;
    modifiedFiles.push(file.fsFile);
    filesStatus[file.filePath] = FileStatus.added;
  });
  mergeResults.removeFiles.forEach((file) => {
    const filePath: PathOsBased = path.normalize(file.filePath);
    filesStatus[file.filePath] = FileStatus.removed;
    modifiedFiles = modifiedFiles.filter((f) => f.relative !== filePath);
  });
  mergeResults.remainDeletedFiles.forEach((file) => {
    const filePath: PathOsBased = path.normalize(file.filePath);
    modifiedFiles = modifiedFiles.filter((f) => f.relative !== filePath);
    filesStatus[file.filePath] = FileStatus.remainDeleted;
  });
  mergeResults.deletedConflictFiles.forEach((file) => {
    filesStatus[file.filePath] = FileStatus.deletedConflict;
  });

  mergeResults.overrideFiles.forEach((file) => {
    const filePath: PathOsBased = path.normalize(file.filePath);
    const foundFile = modifiedFiles.find((componentFile) => componentFile.relative === filePath);
    if (!foundFile) throw new BitError(`file ${filePath} not found`);
    foundFile.contents = file.fsFile.contents;
    filesStatus[file.filePath] = FileStatus.overridden;
  });
  mergeResults.updatedFiles.forEach((file) => {
    const filePath: PathOsBased = path.normalize(file.filePath);
    const foundFile = modifiedFiles.find((componentFile) => componentFile.relative === filePath);
    if (!foundFile) throw new BitError(`file ${filePath} not found`);
    foundFile.contents = file.content;
    filesStatus[file.filePath] = FileStatus.updated;
  });

  return { filesStatus, modifiedFiles };
}

export function throwForFailures(allComponentsStatus: ComponentStatusBase[]) {
  const failedComponents = allComponentsStatus.filter((c) => c.unchangedMessage && !c.unchangedLegitimately);
  if (failedComponents.length) {
    const failureMsgs = failedComponents
      .map(
        (failedComponent) =>
          `${chalk.bold(failedComponent.id.toString())} - ${chalk.red(failedComponent.unchangedMessage as string)}`
      )
      .join('\n');
    throw new BitError(`unable to proceed due to the following failures:\n${failureMsgs}`);
  }
}
