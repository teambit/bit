import path from 'path';
import { BitError } from '@teambit/bit-error';
import type { SourceFile } from '@teambit/component.sources';
import type { MergeResultsThreeWay } from './three-way-merge';
import type { PathOsBased } from '@teambit/toolbox.path.path';
import { FileStatus, MergeOptions, type MergeStrategy } from './merge-version';

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
