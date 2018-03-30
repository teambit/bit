// @flow
import R from 'ramda';
import Component from '../component';
import { Version } from '../../scope/models';
import { Consumer } from '..';
import { sha1 } from '../../utils';
import { SourceFile } from '../component/sources';
import { Tmp } from '../../scope/repositories';
import mergeFiles from './merge-files';
import type { MergeFileResult, MergeFileParams } from './merge-files';
import type { PathOsBased } from '../../utils/path';
import type { SourceFileModel } from '../../scope/models/version';

export type MergeResults = {
  addFiles: Array<{
    filePath: string,
    fsFile: SourceFile
  }>,
  modifiedFiles: Array<{
    filePath: string,
    fsFile: SourceFile,
    baseFile: SourceFileModel,
    currentFile: SourceFileModel,
    output: ?string,
    conflict: ?string
  }>,
  unModifiedFiles: Array<{
    filePath: string,
    fsFile: SourceFile
  }>,
  overrideFiles: Array<{
    filePath: string,
    fsFile: SourceFile
  }>,
  hasConflicts: boolean
};

export type MergeResultsTwoWay = {
  addFiles: Array<{
    filePath: string,
    otherFile: SourceFileModel
  }>,
  modifiedFiles: Array<{
    filePath: string,
    otherFile: SourceFileModel,
    currentFile: SourceFile,
    output: ?string,
    conflict: ?string
  }>,
  unModifiedFiles: Array<{
    filePath: string,
    currentFile: SourceFile
  }>,
  hasConflicts: boolean
};

/**
 * it's easier to understand with an example.
 * a component bar/foo has two versions: 0.0.1, 0.0.2. Also, the component was modified locally.
 * the user is running 'bit use 0.0.1 bar/foo' to switch the version of bar/foo to 0.0.1.
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
export async function threeWayMergeVersions({
  consumer,
  otherComponent,
  otherVersion,
  currentComponent,
  currentVersion,
  baseComponent
}: {
  consumer: Consumer,
  otherComponent: Component,
  otherVersion: string,
  currentComponent: Version,
  currentVersion: string,
  baseComponent: Version
}): Promise<MergeResults> {
  // baseFiles and currentFiles come from the model, therefore their paths include the
  // sharedOriginallyDir. fsFiles come from the Fs, therefore their paths don't include the
  // sharedOriginallyDir.
  // option 1) strip sharedOriginallyDir from baseFiles and currentFiles. the problem is that the
  // sharedDir can be different if the dependencies were changes for example, as a result, it won't
  // be possible to compare between the files as the paths are different.
  // option 2) add sharedOriginallyDir to the fsFiles. we must go with this option.
  const baseFiles = baseComponent.files;
  const currentFiles = currentComponent.files;
  const fsFiles = otherComponent.files.map((file) => {
    const fsFile = file.clone();
    const newRelative = otherComponent.addSharedDir(file.relative);
    fsFile.updatePaths({ newBase: file.base, newRelative });
    return fsFile;
  });
  const results = { addFiles: [], modifiedFiles: [], unModifiedFiles: [], overrideFiles: [], hasConflicts: false };
  const getFileResult = (fsFile: SourceFile, baseFile?: SourceFileModel, currentFile?: SourceFileModel) => {
    const filePath = fsFile.relative;
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
    const fsFileHash = sha1(fsFile.contents);
    const baseFileHash = baseFile.file.hash;
    const currentFileHash = currentFile.file.hash;
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
    fsFile.version = otherVersion;
    // $FlowFixMe it's a hack to pass the data, version is not a valid attribute.
    baseFile.version = otherVersion;
    // $FlowFixMe it's a hack to pass the data, version is not a valid attribute.
    currentFile.version = currentVersion;
    results.modifiedFiles.push({ filePath, fsFile, baseFile, currentFile, output: null, conflict: null });
  };

  fsFiles.forEach((fsFile) => {
    const relativePath = fsFile.relative;
    const baseFile = baseFiles.find(file => file.relativePath === relativePath);
    const currentFile = currentFiles.find(file => file.relativePath === relativePath);
    getFileResult(fsFile, baseFile, currentFile);
  });

  if (R.isEmpty(results.modifiedFiles)) return results;

  const conflictResults = await getConflictResults(consumer, results.modifiedFiles);
  conflictResults.forEach((conflictResult) => {
    const modifiedFile = results.modifiedFiles.find(file => file.filePath === conflictResult.filePath);
    if (!modifiedFile) throw new Error(`unable to find ${conflictResult.filePath} in modified files array`);
    modifiedFile.output = conflictResult.output;
    modifiedFile.conflict = conflictResult.conflict;
    if (conflictResult.conflict) results.hasConflicts = true;
  });

  return results;
}

export async function twoWayMergeVersions({
  consumer,
  otherComponent,
  otherVersion,
  currentComponent,
  currentVersion
}: {
  consumer: Consumer,
  otherComponent: Version,
  otherVersion: string,
  currentComponent: Component,
  currentVersion: string
}): Promise<MergeResultsTwoWay> {
  const otherFiles: SourceFileModel[] = otherComponent.files;
  const currentFiles: SourceFile[] = currentComponent.cloneFilesWithSharedDir();
  const results: MergeResultsTwoWay = {
    addFiles: [],
    modifiedFiles: [],
    unModifiedFiles: [],
    overrideFiles: [],
    hasConflicts: false
  };
  const getFileResult = (otherFile: SourceFileModel, currentFile?: SourceFile) => {
    const filePath = otherFile.relativePath;
    if (!currentFile) {
      results.addFiles.push({ filePath, otherFile });
      return;
    }
    const otherFileHash = otherFile.file.hash;
    const currentFileHash = sha1(currentFile.contents);
    if (otherFileHash === currentFileHash) {
      results.unModifiedFiles.push({ filePath, currentFile });
      return;
    }
    // it was changed in both, there is a chance for conflict
    currentFile.version = currentVersion;
    // $FlowFixMe it's a hack to pass the data, version is not a valid attribute.
    otherFile.version = otherVersion;
    results.modifiedFiles.push({ filePath, currentFile, otherFile, output: null, conflict: null });
  };

  otherFiles.forEach((otherFile) => {
    const relativePath = otherFile.relativePath;
    const currentFile = currentFiles.find(file => file.relative === relativePath);
    getFileResult(otherFile, currentFile);
  });

  if (R.isEmpty(results.modifiedFiles)) return results;

  const conflictResults = await getConflictResultsTwoWay(consumer, results.modifiedFiles);
  conflictResults.forEach((conflictResult) => {
    const modifiedFile = results.modifiedFiles.find(file => file.filePath === conflictResult.filePath);
    if (!modifiedFile) throw new Error(`unable to find ${conflictResult.filePath} in modified files array`);
    modifiedFile.output = conflictResult.output;
    modifiedFile.conflict = conflictResult.conflict;
    if (conflictResult.conflict) results.hasConflicts = true;
  });

  return results;
}

async function getConflictResults(
  consumer: Consumer,
  modifiedFiles: $PropertyType<MergeResults, 'modifiedFiles'>
): Promise<MergeFileResult[]> {
  const tmp = new Tmp(consumer.scope);
  const conflictResultsP = modifiedFiles.map(async (modifiedFile) => {
    const fsFilePathP = tmp.save(modifiedFile.fsFile.contents);
    const writeFile = async (file: SourceFileModel): Promise<PathOsBased> => {
      const content = await file.file.load(consumer.scope.objects);
      return tmp.save(content);
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
        // $FlowFixMe
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
  try {
    const conflictResults = await Promise.all(conflictResultsP);
    await tmp.clear();
    return conflictResults;
  } catch (err) {
    await tmp.clear();
    throw err;
  }
}

async function getConflictResultsTwoWay(
  consumer: Consumer,
  modifiedFiles: $PropertyType<MergeResultsTwoWay, 'modifiedFiles'>
): Promise<MergeFileResult[]> {
  const tmp = new Tmp(consumer.scope);
  const conflictResultsP = modifiedFiles.map(async (modifiedFile) => {
    const currentFilePathP = tmp.save(modifiedFile.currentFile.contents);
    const writeFile = async (file: SourceFileModel): Promise<PathOsBased> => {
      const content = await file.file.load(consumer.scope.objects);
      return tmp.save(content);
    };
    const baseFilePathP = tmp.save('');
    const otherFilePathP = writeFile(modifiedFile.otherFile);
    const [otherFilePath, baseFilePath, currentFilePath] = await Promise.all([
      otherFilePathP,
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
        // $FlowFixMe
        label: modifiedFile.otherFile.version,
        path: otherFilePath
      }
    };
    return mergeFiles(mergeFilesParams);
  });
  try {
    const conflictResults = await Promise.all(conflictResultsP);
    await tmp.clear();
    return conflictResults;
  } catch (err) {
    await tmp.clear();
    throw err;
  }
}
