import R from 'ramda';
import Component from '../../component/consumer-component';
import Consumer from '../../consumer';
import { sha1, pathNormalizeToLinux } from '../../../utils';
import { SourceFile } from '../../component/sources';
import Tmp from '../../../scope/repositories/tmp';
import mergeFiles from '../../../utils/merge-files';
import { MergeFileResult, MergeFileParams } from '../../../utils/merge-files';
import { PathOsBased, PathLinux } from '../../../utils/path';
import GeneralError from '../../../error/general-error';

export type MergeResultsTwoWay = {
  addFiles: Array<{
    filePath: PathLinux;
    otherFile: SourceFile;
  }>;
  modifiedFiles: Array<{
    filePath: PathLinux;
    otherFile: SourceFile;
    currentFile: SourceFile;
    output: string | null | undefined;
    conflict: string | null | undefined;
  }>;
  unModifiedFiles: Array<{
    filePath: PathLinux;
    currentFile: SourceFile;
  }>;
  hasConflicts: boolean;
};

export default (async function twoWayMergeVersions({
  consumer,
  otherComponent,
  otherVersion,
  currentComponent,
  currentVersion
}: {
  consumer: Consumer;
  otherComponent: Component;
  otherVersion: string;
  currentComponent: Component;
  currentVersion: string;
}): Promise<MergeResultsTwoWay> {
  const otherFiles: SourceFile[] = otherComponent.files;
  const currentFiles: SourceFile[] = currentComponent.files;
  const results: MergeResultsTwoWay = {
    addFiles: [],
    modifiedFiles: [],
    unModifiedFiles: [],
    overrideFiles: [],
    hasConflicts: false
  };
  const getFileResult = (otherFile: SourceFile, currentFile?: SourceFile) => {
    const filePath = pathNormalizeToLinux(otherFile.relative);
    if (!currentFile) {
      results.addFiles.push({ filePath, otherFile });
      return;
    }
    const otherFileHash = sha1(otherFile.contents);
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

  otherFiles.forEach((otherFile: SourceFile) => {
    const currentFile = currentFiles.find(file => file.relative === otherFile.relative);
    getFileResult(otherFile, currentFile);
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
  modifiedFiles: $PropertyType<MergeResultsTwoWay, 'modifiedFiles'>
): Promise<MergeFileResult[]> {
  const tmp = new Tmp(consumer.scope);
  const conflictResultsP = modifiedFiles.map(async modifiedFile => {
    const currentFilePathP = tmp.save(modifiedFile.currentFile.contents);
    const writeFile = async (file: SourceFile): Promise<PathOsBased> => {
      return tmp.save(file.contents);
    };
    const baseFilePathP: Promise<PathOsBased> = tmp.save('');
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
  return Promise.all(conflictResultsP);
}
