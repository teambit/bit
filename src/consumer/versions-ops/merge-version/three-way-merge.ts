import R from 'ramda';

import { Consumer } from '../..';
import GeneralError from '../../../error/general-error';
import { Source, Version } from '../../../scope/models';
import { SourceFileModel } from '../../../scope/models/version';
import { Tmp } from '../../../scope/repositories';
import { eol, sha1 } from '../../../utils';
import mergeFiles, { MergeFileParams, MergeFileResult } from '../../../utils/merge-files';
import { PathLinux, pathNormalizeToLinux, PathOsBased } from '../../../utils/path';
import Component from '../../component';
import { SourceFile } from '../../component/sources';

export type MergeResultsThreeWay = {
  addFiles: Array<{
    filePath: PathLinux;
    fsFile: SourceFile;
  }>;
  removeFiles: Array<{
    filePath: PathLinux;
  }>;
  remainDeletedFiles: Array<{
    filePath: PathLinux;
  }>;
  modifiedFiles: Array<{
    filePath: PathLinux;
    fsFile: SourceFile;
    baseFile: SourceFileModel;
    currentFile: SourceFileModel;
    output: string | null | undefined;
    conflict: string | null | undefined;
    isBinaryConflict?: boolean;
  }>;
  unModifiedFiles: Array<{
    filePath: PathLinux;
    fsFile: SourceFile;
  }>;
  overrideFiles: Array<{
    filePath: PathLinux;
    fsFile: SourceFile;
  }>;
  updatedFiles: Array<{
    filePath: PathLinux;
    currentFile: SourceFileModel;
    content: Buffer;
  }>;
  hasConflicts: boolean;
};

/**
 * it's easier to understand with an example.
 * a component bar/foo has two versions: 0.0.1, 0.0.2. Also, the component was modified locally.
 * the user is running 'bit checkout 0.0.1 bar/foo' to switch the version of bar/foo to 0.0.1.
 *
 * the goal is to rewrite bar/foo to the filesystem as 0.0.1 and keeping the local changes.
 * in other words, the changes the user did since 0.0.2 should be applied/merged on top of 0.0.1.
 *
 * to do the actual merge we use git, specifically `merge-file` command, so we try to use the same
 * terminology as git. From the command help:
 * `git merge-file <current-file> <base-file> <other-file>
 * git merge-file incorporates all changes that lead from the <base-file> to <other-file> into
 * <current-file>. The result ordinarily goes into <current-file>.`
 *
 * according to the example above:
 * current-file => bar/foo@0.0.1
 * base-file    => bar/foo@0.0.2
 * other-file   => bar/foo@0.0.2 + modification
 *
 *
 * another example. bar/foo is locally 0.0.1 with local changes, and the latest on the remote is 0.0.2.
 * the user is running `bit checkout latest bar/foo` to checkout to 0.0.2.
 * current-file => bar/foo@0.0.2
 * base-file    => bar/foo@0.0.1
 * other-file   => bar/foo@0.0.1 + modification
 *
 *
 * another example. bar/foo is locally 0.0.1 with no local changes, and the latest on the remote is 0.0.2.
 * the user is running `bit checkout latest bar/foo` to checkout to 0.0.2.
 * current-file => bar/foo@0.0.2
 * base-file    => bar/foo@0.0.1
 * other-file   => bar/foo@0.0.1
 * in this case, the base-file and other-file are the same and we want to write the current without checking
 * for conflicts.
 */
export default async function threeWayMergeVersions({
  consumer,
  otherComponent,
  otherLabel,
  currentComponent,
  currentLabel,
  baseComponent,
}: {
  consumer: Consumer;
  otherComponent: Component;
  otherLabel: string;
  currentComponent: Version;
  currentLabel: string;
  baseComponent: Version;
}): Promise<MergeResultsThreeWay> {
  // baseFiles and currentFiles come from the model, therefore their paths include the
  // sharedOriginallyDir. fsFiles come from the Fs, therefore their paths don't include the
  // sharedOriginallyDir.
  // option 1) strip sharedOriginallyDir from baseFiles and currentFiles. the problem is that the
  // sharedDir can be different if the dependencies were changes for example, as a result, it won't
  // be possible to compare between the files as the paths are different.
  // in the previous it was implemented this way and caused a bug, which now has an e2e-test to
  // block it. see https://github.com/teambit/bit/pull/2070 PR.
  // option 2) add sharedOriginallyDir to the fsFiles. we must go with this option.
  // one thing we have to change is the end-of-line, it should be set as LF, same way we do before
  // saving the file as an object.
  const baseFiles: SourceFileModel[] = baseComponent.files;
  const currentFiles: SourceFileModel[] = currentComponent.files;
  const fsFiles: SourceFile[] = otherComponent.cloneFilesWithSharedDir();
  fsFiles.forEach((fsFile) => {
    fsFile.contents = eol.lf(fsFile.contents) as Buffer;
  });
  const results: MergeResultsThreeWay = {
    addFiles: [],
    removeFiles: [],
    remainDeletedFiles: [],
    modifiedFiles: [],
    unModifiedFiles: [],
    overrideFiles: [],
    updatedFiles: [],
    hasConflicts: false,
  };
  const getFileResult = async (fsFile: SourceFile, baseFile?: SourceFileModel, currentFile?: SourceFileModel) => {
    const filePath: PathLinux = pathNormalizeToLinux(fsFile.relative);
    if (!currentFile) {
      // if !currentFile && !baseFile, the file was created after the last tag, no need to do any
      // calculation, the file should be added
      if (!baseFile) {
        results.addFiles.push({ filePath, fsFile });
        return;
      }
      // if !currentFile && baseFile, the file was created as part of the last tag but not
      // available on the current, so it needs to be removed.
      results.removeFiles.push({ filePath });
      return;
    }
    if (!baseFile) {
      // if currentFile && !baseFile, the file was deleted as part of the last tag
      results.overrideFiles.push({ filePath, fsFile });
      return;
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const fsFileHash = sha1(fsFile.contents);
    const baseFileHash = baseFile.file.hash;
    const currentFileHash = currentFile.file.hash;
    if (fsFileHash === currentFileHash) {
      // no need to check also for fsFileHash === baseFileHash, as long as fs === current, no need
      // to take any action
      results.unModifiedFiles.push({ filePath, fsFile });
      return;
    }
    if (fsFileHash === baseFileHash) {
      // the file has no local modification.
      // the file currently in the fs, is not the same as the file we want to write (current).
      // but no need to check whether it has conflicts because we always want to write the current.
      const content = (await currentFile.file.load(consumer.scope.objects)) as Source;
      results.updatedFiles.push({ filePath, currentFile, content: content.contents });
      return;
    }
    // it was changed in both, there is a chance for conflict
    // @ts-ignore it's a hack to pass the data, version is not a valid attribute.
    fsFile.label = otherLabel;
    // @ts-ignore it's a hack to pass the data, version is not a valid attribute.
    currentFile.label = currentLabel;
    results.modifiedFiles.push({ filePath, fsFile, baseFile, currentFile, output: null, conflict: null });
  };

  await Promise.all(
    fsFiles.map(async (fsFile) => {
      const relativePath = pathNormalizeToLinux(fsFile.relative);
      const baseFile = baseFiles.find((file) => file.relativePath === relativePath);
      const currentFile = currentFiles.find((file) => file.relativePath === relativePath);
      await getFileResult(fsFile, baseFile, currentFile);
    })
  );
  const fsFilesPaths = fsFiles.map((fsFile) => pathNormalizeToLinux(fsFile.relative));
  const baseFilesPaths = baseFiles.map((baseFile) => baseFile.relativePath);
  const deletedFromFs = currentFiles.filter(
    (currentFile) =>
      !fsFilesPaths.includes(currentFile.relativePath) && baseFilesPaths.includes(currentFile.relativePath)
  );
  deletedFromFs.forEach((file) => results.remainDeletedFiles.push({ filePath: file.relativePath }));
  if (R.isEmpty(results.modifiedFiles)) return results;

  const conflictResults = await getMergeResults(consumer, results.modifiedFiles);
  conflictResults.forEach((conflictResult: MergeFileResult) => {
    const modifiedFile = results.modifiedFiles.find((file) => file.filePath === conflictResult.filePath);
    if (!modifiedFile) throw new GeneralError(`unable to find ${conflictResult.filePath} in modified files array`);
    modifiedFile.output = conflictResult.output;
    modifiedFile.conflict = conflictResult.conflict;
    modifiedFile.isBinaryConflict = conflictResult.isBinaryConflict;
    if (conflictResult.conflict || conflictResult.isBinaryConflict) results.hasConflicts = true;
  });

  return results;
}

async function getMergeResults(
  consumer: Consumer,
  modifiedFiles: MergeResultsThreeWay['modifiedFiles']
): Promise<MergeFileResult[]> {
  const tmp = new Tmp(consumer.scope);
  const conflictResultsP = modifiedFiles.map(async (modifiedFile) => {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const fsFilePathP = tmp.save(modifiedFile.fsFile.contents);
    const writeFile = async (file: SourceFileModel): Promise<PathOsBased> => {
      const content = await file.file.load(consumer.scope.objects);
      // @ts-ignore
      return tmp.save(content.contents.toString());
    };
    const baseFilePathP = writeFile(modifiedFile.baseFile);
    const currentFilePathP = writeFile(modifiedFile.currentFile);
    const [fsFilePath, baseFilePath, currentFilePath] = await Promise.all([
      fsFilePathP,
      baseFilePathP,
      currentFilePathP,
    ]);
    const mergeFilesParams: MergeFileParams = {
      filePath: modifiedFile.filePath,
      currentFile: {
        label: modifiedFile.fsFile.label,
        path: fsFilePath,
      },
      baseFile: {
        path: baseFilePath,
      },
      otherFile: {
        // @ts-ignore
        label: modifiedFile.currentFile.label,
        path: currentFilePath,
      },
    };
    return mergeFiles(mergeFilesParams);
  });
  return Promise.all(conflictResultsP);
}
