import R from 'ramda';
import Component from '../../component';
import { Consumer } from '../..';
import { sha1 } from '../../../utils';
import { SourceFile } from '../../component/sources';
import { Tmp } from '../../../scope/repositories';
import mergeFiles from '../../../utils/merge-files';
import { MergeFileResult, MergeFileParams } from '../../../utils/merge-files';
import { PathOsBased, PathLinux, pathNormalizeToLinux } from '../../../utils/path';
import GeneralError from '../../../error/general-error';
import { Version } from '../../../scope/models';
import { SourceFileModel } from '../../../scope/models/version';

export type MergeResultsThreeWay = {
  addFiles: Array<{
    filePath: PathLinux;
    fsFile: SourceFile;
  }>;
  modifiedFiles: Array<{
    filePath: PathLinux;
    fsFile: SourceFile;
    baseFile: SourceFileModel;
    currentFile: SourceFileModel;
    output: string | null | undefined;
    conflict: string | null | undefined;
  }>;
  unModifiedFiles: Array<{
    filePath: PathLinux;
    fsFile: SourceFile;
  }>;
  overrideFiles: Array<{
    filePath: PathLinux;
    fsFile: SourceFile;
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
 */
export default (async function threeWayMergeVersions({
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
  const baseFiles: SourceFileModel[] = baseComponent.files;
  const currentFiles: SourceFileModel[] = currentComponent.files;
  const fsFiles: SourceFile[] = otherComponent.cloneFilesWithSharedDir();
  const results = { addFiles: [], modifiedFiles: [], unModifiedFiles: [], overrideFiles: [], hasConflicts: false };
  const getFileResult = (fsFile: SourceFile, baseFile?: SourceFileModel, currentFile?: SourceFileModel) => {
    const filePath: PathLinux = pathNormalizeToLinux(fsFile.relative);
    if (!currentFile) {
      // if !currentFile && !baseFile, the file was created after the last tag
      // if !currentFile && baseFile,  the file was created as part of the last tag
      // either way, no need to do any calculation, the file should be added
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      results.addFiles.push({ filePath, fsFile });
      return;
    }
    if (!baseFile) {
      // if currentFile && !baseFile, the file was deleted as part of the last tag
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      results.overrideFiles.push({ filePath, fsFile });
      return;
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const fsFileHash = sha1(fsFile.contents);
    const baseFileHash = baseFile.file.hash;
    const currentFileHash = currentFile.file.hash;
    if (fsFileHash === currentFileHash) {
      // no need to check also for fsFileHash === baseFileHash, as long as fs == current, no need to take any action
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      results.unModifiedFiles.push({ filePath, fsFile });
      return;
    }
    if (fsFileHash === baseFileHash) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      results.overrideFiles.push({ filePath, fsFile });
      return;
    }
    // it was changed in both, there is a chance for conflict
    // @ts-ignore it's a hack to pass the data, version is not a valid attribute.
    fsFile.label = otherLabel;
    // @ts-ignore it's a hack to pass the data, version is not a valid attribute.
    currentFile.label = currentLabel;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    results.modifiedFiles.push({ filePath, fsFile, baseFile, currentFile, output: null, conflict: null });
  };

  fsFiles.forEach((fsFile) => {
    const relativePath = pathNormalizeToLinux(fsFile.relative);
    const baseFile = baseFiles.find((file) => file.relativePath === relativePath);
    const currentFile = currentFiles.find((file) => file.relativePath === relativePath);
    getFileResult(fsFile, baseFile, currentFile);
  });

  if (R.isEmpty(results.modifiedFiles)) return results;

  const conflictResults = await getMergeResults(consumer, results.modifiedFiles);
  conflictResults.forEach((conflictResult: MergeFileResult) => {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const modifiedFile = results.modifiedFiles.find((file) => file.filePath === conflictResult.filePath);
    if (!modifiedFile) throw new GeneralError(`unable to find ${conflictResult.filePath} in modified files array`);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    modifiedFile.output = conflictResult.output;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    modifiedFile.conflict = conflictResult.conflict;
    if (conflictResult.conflict) results.hasConflicts = true;
  });

  return results;
});

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
        // @ts-ignore
        label: modifiedFile.currentFile.label,
        path: currentFilePath,
      },
      baseFile: {
        path: baseFilePath,
      },
      otherFile: {
        // @ts-ignore
        label: modifiedFile.fsFile.label,
        path: fsFilePath,
      },
    };
    return mergeFiles(mergeFilesParams);
  });
  return Promise.all(conflictResultsP);
}
