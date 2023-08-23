import * as path from 'path';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { BitId } from '@teambit/legacy-bit-id';
import GeneralError from '@teambit/legacy/dist/error/general-error';
import Version from '@teambit/legacy/dist/scope/models/version';
import { SourceFile } from '@teambit/legacy/dist/consumer/component/sources';
import { pathNormalizeToLinux, PathOsBased } from '@teambit/legacy/dist/utils/path';
import DataToPersist from '@teambit/legacy/dist/consumer/component/sources/data-to-persist';
import RemovePath from '@teambit/legacy/dist/consumer/component/sources/remove-path';
import {
  ApplyVersionResult,
  FilesStatus,
  FileStatus,
  MergeOptions,
  MergeStrategy,
} from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import { MergeResultsThreeWay } from '@teambit/legacy/dist/consumer/versions-ops/merge-version/three-way-merge';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';

export type CheckoutProps = {
  version?: string; // if reset is true, the version is undefined
  ids?: BitId[];
  latestVersion?: boolean;
  promptMergeOptions?: boolean;
  mergeStrategy?: MergeStrategy | null;
  verbose?: boolean;
  skipNpmInstall?: boolean;
  ignorePackageJson?: boolean;
  writeConfig?: boolean;
  reset?: boolean; // remove local changes. if set, the version is undefined.
  all?: boolean; // checkout all ids
  ignoreDist?: boolean;
  isLane?: boolean;
};

export type ComponentStatusBase = {
  currentComponent?: ConsumerComponent;
  componentFromModel?: Version;
  id: BitId;
  shouldBeRemoved?: boolean; // in case the component is soft-removed, it should be removed from the workspace
};

export type ComponentStatus = ComponentStatusBase & {
  failureMessage?: string;
  unchangedLegitimately?: boolean; // failed to checkout but for a legitimate reason, such as, up-to-date
  mergeResults?: MergeResultsThreeWay | null | undefined;
};

export type ApplyVersionWithComps = { applyVersionResult: ApplyVersionResult; component?: ConsumerComponent };

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
  let filesStatus = {};
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
  const component = await consumer.loadComponentFromModelImportIfNeeded(id);
  const componentMap = componentFromFS && componentFromFS.componentMap;
  if (componentFromFS && !componentMap) throw new GeneralError('applyVersion: componentMap was not found');

  const files = component.files;
  files.forEach((file) => {
    filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.updated;
  });

  await removeFilesIfNeeded(filesStatus, componentFromFS || undefined);

  if (mergeResults) {
    // update files according to the merge results
    const { filesStatus: modifiedStatus, modifiedFiles } = applyModifiedVersion(files, mergeResults, mergeStrategy);
    filesStatus = { ...filesStatus, ...modifiedStatus };
    component.files = modifiedFiles;
  }

  return {
    applyVersionResult: { id, filesStatus },
    component,
  };
}

/**
 * when files exist on the filesystem but not on the checked out versions, they need to be deleted.
 * without this function, these files would be left on the filesystem. (we don't delete the comp-dir before writing).
 * this needs to be done *before* the component is written to the filesystem, otherwise, it won't work when a file
 * has a case change. e.g. from uppercase to lowercase. (see merge-lane.e2e 'renaming files from uppercase to lowercase').
 */
export async function removeFilesIfNeeded(filesStatus: FilesStatus, componentFromFS?: ConsumerComponent) {
  if (!componentFromFS) return;
  const filePathsFromFS = componentFromFS.files || [];
  const dataToPersist = new DataToPersist();
  filePathsFromFS.forEach((file) => {
    const filename = pathNormalizeToLinux(file.relative);
    if (!filesStatus[filename]) {
      // @ts-ignore todo: typescript has a good point here. it should be the string "removed", not chalk.green(removed).
      filesStatus[filename] = FileStatus.removed;
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
    if (!foundFile) throw new GeneralError(`file ${filePath} not found`);
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
      throw new GeneralError(`file ${filePath} does not have output nor conflict`);
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
    if (!foundFile) throw new GeneralError(`file ${filePath} not found`);
    foundFile.contents = file.fsFile.contents;
    filesStatus[file.filePath] = FileStatus.overridden;
  });
  mergeResults.updatedFiles.forEach((file) => {
    const filePath: PathOsBased = path.normalize(file.filePath);
    const foundFile = modifiedFiles.find((componentFile) => componentFile.relative === filePath);
    if (!foundFile) throw new GeneralError(`file ${filePath} not found`);
    foundFile.contents = file.content;
    filesStatus[file.filePath] = FileStatus.updated;
  });

  return { filesStatus, modifiedFiles };
}
