import R from 'ramda';

import GeneralError from '../../../error/general-error';
import Tmp from '../../../scope/repositories/tmp';
import { pathNormalizeToLinux, sha1 } from '../../../utils';
import mergeFiles, { MergeFileParams, MergeFileResult } from '../../../utils/merge-files';
import { PathLinux, PathOsBased } from '../../../utils/path';
import Component from '../../component/consumer-component';
import { SourceFile } from '../../component/sources';
import Consumer from '../../consumer';

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
  currentVersion,
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
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    overrideFiles: [],
    hasConflicts: false,
  };
  const getFileResult = (otherFile: SourceFile, currentFile?: SourceFile) => {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const filePath = pathNormalizeToLinux(otherFile.relative);
    if (!currentFile) {
      results.addFiles.push({ filePath, otherFile });
      return;
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const otherFileHash = sha1(otherFile.contents);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const currentFileHash = sha1(currentFile.contents);
    if (otherFileHash === currentFileHash) {
      results.unModifiedFiles.push({ filePath, currentFile });
      return;
    }
    // it was changed in both, there is a chance for conflict
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    currentFile.version = currentVersion;
    // $FlowFixMe it's a hack to pass the data, version is not a valid attribute.
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    otherFile.version = otherVersion;
    results.modifiedFiles.push({ filePath, currentFile, otherFile, output: null, conflict: null });
  };

  otherFiles.forEach((otherFile: SourceFile) => {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const currentFile = currentFiles.find((file) => file.relative === otherFile.relative);
    getFileResult(otherFile, currentFile);
  });

  if (R.isEmpty(results.modifiedFiles)) return results;

  const conflictResults = await getMergeResults(consumer, results.modifiedFiles);
  conflictResults.forEach((conflictResult: MergeFileResult) => {
    const modifiedFile = results.modifiedFiles.find((file) => file.filePath === conflictResult.filePath);
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
  modifiedFiles: $PropertyType<MergeResultsTwoWay, 'modifiedFiles'>
): Promise<MergeFileResult[]> {
  const tmp = new Tmp(consumer.scope);
  const conflictResultsP = modifiedFiles.map(async (modifiedFile) => {
    const currentFilePathP = tmp.save(modifiedFile.currentFile.contents);
    const writeFile = async (file: SourceFile): Promise<PathOsBased> => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return tmp.save(file.contents);
    };
    const baseFilePathP: Promise<PathOsBased> = tmp.save('');
    const otherFilePathP = writeFile(modifiedFile.otherFile);
    const [otherFilePath, baseFilePath, currentFilePath] = await Promise.all([
      otherFilePathP,
      baseFilePathP,
      currentFilePathP,
    ]);
    const mergeFilesParams: MergeFileParams = {
      filePath: modifiedFile.filePath,
      currentFile: {
        label: modifiedFile.currentFile.version,
        path: currentFilePath,
      },
      baseFile: {
        path: baseFilePath,
      },
      otherFile: {
        label: modifiedFile.otherFile.version,
        path: otherFilePath,
      },
    };
    return mergeFiles(mergeFilesParams);
  });
  return Promise.all(conflictResultsP);
}
