// @flow
import R from 'ramda';
import Component from '../../component';
import { Version } from '../../../scope/models';
import { Consumer } from '../..';
import { sha1 } from '../../../utils';
import { SourceFile } from '../../component/sources';
import { Tmp } from '../../../scope/repositories';
import mergeFiles from '../../../utils/merge-files';
import type { MergeFileResult, MergeFileParams } from '../../../utils/merge-files';
import type { PathOsBased } from '../../../utils/path';
import type { SourceFileModel } from '../../../scope/models/version';

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

export default (async function twoWayMergeVersions({
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

  const conflictResults = await getConflictResults(consumer, results.modifiedFiles);
  conflictResults.forEach((conflictResult) => {
    const modifiedFile = results.modifiedFiles.find(file => file.filePath === conflictResult.filePath);
    if (!modifiedFile) throw new Error(`unable to find ${conflictResult.filePath} in modified files array`);
    modifiedFile.output = conflictResult.output;
    modifiedFile.conflict = conflictResult.conflict;
    if (conflictResult.conflict) results.hasConflicts = true;
  });

  return results;
});

async function getConflictResults(
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
