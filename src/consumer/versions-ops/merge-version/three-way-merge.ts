import R from 'ramda';
import Component from '../../component';
import { Consumer } from '../..';
import { sha1, pathNormalizeToLinux } from '../../../utils';
import { SourceFile } from '../../component/sources';
import { Tmp } from '../../../scope/repositories';
import mergeFiles from '../../../utils/merge-files';
import { MergeFileResult, MergeFileParams } from '../../../utils/merge-files';
import { PathOsBased, PathLinux } from '../../../utils/path';
import GeneralError from '../../../error/general-error';

export type MergeResultsThreeWay = {
  addFiles: Array<{
    filePath: PathLinux;
    fsFile: SourceFile;
  }>;
  modifiedFiles: Array<{
    filePath: PathLinux;
    fsFile: SourceFile;
    baseFile: SourceFile;
    currentFile: SourceFile;
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
  otherVersion,
  currentComponent,
  currentVersion,
  baseComponent
}: {
  consumer: Consumer;
  otherComponent: Component;
  otherVersion: string;
  currentComponent: Component;
  currentVersion: string;
  baseComponent: Component;
}): Promise<MergeResultsThreeWay> {
  const baseFiles: SourceFile[] = baseComponent.files;
  const currentFiles: SourceFile[] = currentComponent.files;
  const fsFiles: SourceFile[] = otherComponent.files;
  const results = { addFiles: [], modifiedFiles: [], unModifiedFiles: [], overrideFiles: [], hasConflicts: false };
  const getFileResult = (fsFile: SourceFile, baseFile?: SourceFile, currentFile?: SourceFile) => {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const filePath: PathLinux = pathNormalizeToLinux(fsFile.relative);
    if (!currentFile) {
      // if !currentFile && !baseFile, the file was created after the last tag
      // if !currentFile && baseFile,  the file was created as part of the last tag
      // either way, no need to do any calculation, the file should be added
      results.addFiles.push({ filePath, fsFile });
      return;
    }
    if (!baseFile) {
      // if currentFile && !baseFile, the file was deleted as part of the last tag
      results.overrideFiles.push({ filePath, fsFile });
      return;
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const fsFileHash = sha1(fsFile.contents);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const baseFileHash = sha1(baseFile.contents);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const currentFileHash = sha1(currentFile.contents);
    if (fsFileHash === currentFileHash) {
      // no need to check also for fsFileHash === baseFileHash, as long as fs == current, no need to take any action
      results.unModifiedFiles.push({ filePath, fsFile });
      return;
    }
    if (fsFileHash === baseFileHash) {
      results.overrideFiles.push({ filePath, fsFile });
      return;
    }
    // it was changed in both, there is a chance for conflict
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    fsFile.version = otherVersion;
    // $FlowFixMe it's a hack to pass the data, version is not a valid attribute.
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    baseFile.version = otherVersion;
    // $FlowFixMe it's a hack to pass the data, version is not a valid attribute.
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    currentFile.version = currentVersion;
    results.modifiedFiles.push({ filePath, fsFile, baseFile, currentFile, output: null, conflict: null });
  };

  fsFiles.forEach(fsFile => {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const baseFile = baseFiles.find(file => file.relative === fsFile.relative);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const currentFile = currentFiles.find(file => file.relative === fsFile.relative);
    getFileResult(fsFile, baseFile, currentFile);
  });

  if (R.isEmpty(results.modifiedFiles)) return results;

  const conflictResults = await getMergeResults(consumer, results.modifiedFiles);
  conflictResults.forEach((conflictResult: MergeFileResult) => {
    const modifiedFile = results.modifiedFiles.find(file => file.filePath === conflictResult.filePath);
    if (!modifiedFile) throw new GeneralError(`unable to find ${conflictResult.filePath} in modified files array`);
    modifiedFile.output = conflictResult.output;
    modifiedFile.conflict = conflictResult.conflict;
    if (conflictResult.conflict) results.hasConflicts = true;
  });

  return results;
});

async function getMergeResults(
  consumer: Consumer,
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  modifiedFiles: $PropertyType<MergeResultsThreeWay, 'modifiedFiles'>
): Promise<MergeFileResult[]> {
  const tmp = new Tmp(consumer.scope);
  const conflictResultsP = modifiedFiles.map(async modifiedFile => {
    const fsFilePathP = tmp.save(modifiedFile.fsFile.contents);
    const writeFile = async (file: SourceFile): Promise<PathOsBased> => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return tmp.save(file.contents);
    };
    const baseFilePathP = writeFile(modifiedFile.baseFile);
    const currentFilePathP = writeFile(modifiedFile.currentFile);
    const [fsFilePath, baseFilePath, currentFilePath] = await Promise.all([
      fsFilePathP,
      baseFilePathP,
      currentFilePathP
    ]);
    const mergeFilesParams: MergeFileParams = {
      filePath: modifiedFile.filePath,
      currentFile: {
        label: modifiedFile.currentFile.version,
        path: currentFilePath
      },
      baseFile: {
        path: baseFilePath
      },
      otherFile: {
        label: `${modifiedFile.fsFile.version} modified`,
        path: fsFilePath
      }
    };
    return mergeFiles(mergeFilesParams);
  });
  return Promise.all(conflictResultsP);
}
