import { BitError } from '@teambit/bit-error';
import { Source, Version } from '@teambit/legacy/dist/scope/models';
import { SourceFileModel } from '@teambit/legacy/dist/scope/models/version';
import { Tmp } from '@teambit/legacy/dist/scope/repositories';
import { eol, sha1 } from '@teambit/legacy/dist/utils';
import { mergeFiles, MergeFileParams, MergeFileResult } from '../merge-files';
import { PathLinux, pathNormalizeToLinux, PathOsBased } from '@teambit/legacy/dist/utils/path';
import Component from '@teambit/legacy/dist/consumer/component';
import { SourceFile } from '@teambit/legacy/dist/consumer/component/sources';
import { Scope } from '@teambit/legacy/dist/scope';
import { isEmpty } from 'lodash';

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
  deletedConflictFiles: Array<{
    filePath: PathLinux;
    fsFile?: SourceFile;
  }>;
  modifiedFiles: Array<{
    filePath: PathLinux;
    fsFile: SourceFile;
    baseFile?: SourceFileModel;
    otherFile: SourceFileModel;
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
    otherFile: SourceFileModel;
    content: Buffer;
  }>;
  hasConflicts: boolean;
};

/**
 * to do the actual merge we use git, specifically `merge-file` command, so we try to use the same
 * terminology as git. From the command help:
 * `git merge-file <current-file> <base-file> <other-file>
 * git merge-file incorporates all changes that lead from the <base-file> to <other-file> into
 * <current-file>. The result ordinarily goes into <current-file>.`
 *
 * see checkout-version.getBaseVersion() for a case when a component is modified and then the base-file is not the
 * common file before other-file and current-file.
 * otherwise, Git terminology pretty much reflects what we do here. current-file is the one that is currently written
 * to the filesystem. other-file is the one the user wants to checkout to. base-file is the original file where both:
 * base-file and other-file were originated from.
 */
export async function threeWayMerge({
  scope,
  otherComponent,
  otherLabel,
  currentComponent,
  currentLabel,
  baseComponent,
}: {
  scope: Scope;
  otherComponent: Version;
  otherLabel: string;
  currentComponent: Component;
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
  const otherFiles: SourceFileModel[] = otherComponent.files;
  const currentFiles: SourceFile[] = currentComponent.cloneFilesWithSharedDir();
  currentFiles.forEach((fsFile) => {
    fsFile.contents = eol.lf(fsFile.contents) as Buffer;
  });
  const results: MergeResultsThreeWay = {
    addFiles: [],
    removeFiles: [],
    remainDeletedFiles: [],
    deletedConflictFiles: [],
    modifiedFiles: [],
    unModifiedFiles: [],
    overrideFiles: [],
    updatedFiles: [],
    hasConflicts: false,
  };
  const getFileResult = async (fsFile: SourceFile, baseFile?: SourceFileModel, otherFile?: SourceFileModel) => {
    const filePath: PathLinux = pathNormalizeToLinux(fsFile.relative);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const fsFileHash = sha1(fsFile.contents);
    if (!otherFile) {
      // if !otherFile && !baseFile, the file was created after the last tag, no need to do any
      // calculation, the file should be added
      if (!baseFile) {
        results.addFiles.push({ filePath, fsFile });
        return;
      }
      const baseFileHash = baseFile.file.hash;
      if (fsFileHash === baseFileHash) {
        results.removeFiles.push({ filePath });
        return;
      }
      results.deletedConflictFiles.push({ filePath });
      return;
    }
    const otherFileHash = otherFile.file.hash;
    if (fsFileHash === otherFileHash) {
      // if fs === other, no need to take any action (regardless the base)
      results.unModifiedFiles.push({ filePath, fsFile });
      return;
    }
    if (baseFile && fsFileHash === baseFile.file.hash) {
      // the file has no local modification.
      // the file currently in the fs, is not the same as the file we want to write (other).
      // but no need to check whether it has conflicts because we always want to write the other.
      const content = (await otherFile.file.load(scope.objects)) as Source;
      results.updatedFiles.push({ filePath, otherFile, content: content.contents });
      return;
    }
    // it was changed in both, there is a chance for conflict. (regardless the base)
    fsFile.label = currentLabel;
    // @ts-ignore it's a hack to pass the data, version is not a valid attribute.
    otherFile.label = otherLabel;
    results.modifiedFiles.push({ filePath, fsFile, baseFile, otherFile, output: null, conflict: null });
  };

  await Promise.all(
    currentFiles.map(async (fsFile) => {
      const relativePath = pathNormalizeToLinux(fsFile.relative);
      const baseFile = baseFiles.find((file) => file.relativePath === relativePath);
      const otherFile = otherFiles.find((file) => file.relativePath === relativePath);
      await getFileResult(fsFile, baseFile, otherFile);
    })
  );
  const fsFilesPaths = currentFiles.map((fsFile) => pathNormalizeToLinux(fsFile.relative));
  const baseFilesPaths = baseFiles.map((baseFile) => baseFile.relativePath);
  const isOtherSameAsBase = (otherFile: SourceFileModel) => {
    const baseFile = baseFiles.find((file) => file.relativePath === otherFile.relativePath);
    if (!baseFile) throw new Error('isOtherSameAsBase expect the base to be there');
    return baseFile.file.hash === otherFile.file.hash;
  };
  const deletedFromFs = otherFiles.filter(
    (otherFile) =>
      !fsFilesPaths.includes(otherFile.relativePath) &&
      baseFilesPaths.includes(otherFile.relativePath) &&
      isOtherSameAsBase(otherFile)
  );
  const deletedAndModified = otherFiles.filter(
    (otherFile) =>
      !fsFilesPaths.includes(otherFile.relativePath) &&
      baseFilesPaths.includes(otherFile.relativePath) &&
      !isOtherSameAsBase(otherFile)
  );
  const addedOnOther = otherFiles.filter(
    (otherFile) => !fsFilesPaths.includes(otherFile.relativePath) && !baseFilesPaths.includes(otherFile.relativePath)
  );
  deletedFromFs.forEach((file) => results.remainDeletedFiles.push({ filePath: file.relativePath }));
  deletedAndModified.forEach((file) => results.deletedConflictFiles.push({ filePath: file.relativePath }));

  await Promise.all(
    addedOnOther.map(async (file) => {
      const fsFile = await SourceFile.loadFromSourceFileModel(file, scope.objects);
      results.addFiles.push({ filePath: file.relativePath, fsFile });
    })
  );
  await Promise.all(
    deletedAndModified.map(async (file) => {
      const fsFile = await SourceFile.loadFromSourceFileModel(file, scope.objects);
      results.deletedConflictFiles.push({ filePath: file.relativePath, fsFile });
    })
  );
  if (isEmpty(results.modifiedFiles)) return results;

  const conflictResults = await getMergeResults(scope, results.modifiedFiles);
  conflictResults.forEach((conflictResult: MergeFileResult) => {
    const modifiedFile = results.modifiedFiles.find((file) => file.filePath === conflictResult.filePath);
    if (!modifiedFile) throw new BitError(`unable to find ${conflictResult.filePath} in modified files array`);
    modifiedFile.output = conflictResult.output;
    modifiedFile.conflict = conflictResult.conflict;
    modifiedFile.isBinaryConflict = conflictResult.isBinaryConflict;
    if (conflictResult.conflict || conflictResult.isBinaryConflict) results.hasConflicts = true;
  });

  return results;
}

async function getMergeResults(
  scope: Scope,
  modifiedFiles: MergeResultsThreeWay['modifiedFiles']
): Promise<MergeFileResult[]> {
  const tmp = new Tmp(scope);
  const conflictResultsP = modifiedFiles.map(async (modifiedFile) => {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const fsFilePathP = tmp.save(modifiedFile.fsFile.contents);
    const writeFile = async (file: SourceFileModel): Promise<PathOsBased> => {
      const content = await file.file.load(scope.objects);
      // @ts-ignore
      return tmp.save(content.contents.toString());
    };
    const baseFilePathP = modifiedFile.baseFile ? writeFile(modifiedFile.baseFile) : tmp.save('');
    const otherFilePathP = writeFile(modifiedFile.otherFile);
    const [fsFilePath, baseFilePath, otherFilePath] = await Promise.all([fsFilePathP, baseFilePathP, otherFilePathP]);
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
        label: modifiedFile.otherFile.label,
        path: otherFilePath,
      },
    };
    return mergeFiles(mergeFilesParams);
  });
  return Promise.all(conflictResultsP);
}
