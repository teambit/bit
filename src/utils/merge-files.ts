import chalk from 'chalk';
import execa from 'execa';
import logger from '../logger/logger';
import { PathLinux, PathOsBased } from '../utils/path';
import GitNotFound from './git/exceptions/git-not-found';
import getGitExecutablePath from './git/git-executable';

export type MergeFileResult = {
  filePath: PathLinux;
  output: string | null | undefined;
  conflict: string | null | undefined;
  isBinaryConflict?: boolean;
};
export type MergeFileParams = {
  filePath: PathLinux;
  currentFile: {
    label: string;
    path: PathOsBased;
  };
  baseFile: {
    path: PathOsBased;
  };
  otherFile: {
    label: string;
    path: PathOsBased;
  };
};

/**
 * use git `merge-file` command. From the command help:
 * `git merge-file <current-file> <base-file> <other-file>
 * git merge-file incorporates all changes that lead from the <base-file> to <other-file> into
 * <current-file>. The result ordinarily goes into <current-file>.`
 *
 * Here, we are not going to write the result into current-file. Instead, we'll use the "-p" flag,
 * to just return the results.
 */
export default async function mergeFiles({
  filePath,
  currentFile,
  baseFile,
  otherFile,
}: MergeFileParams): Promise<MergeFileResult> {
  const mergeResult: MergeFileResult = { filePath, output: null, conflict: null };
  const gitExecutablePath = getGitExecutablePath();
  try {
    const result = await execa(
      'git',
      [
        'merge-file',
        '-L',
        currentFile.label,
        '-L',
        'Base File',
        '-L',
        otherFile.label,
        currentFile.path,
        baseFile.path,
        otherFile.path,
        '-p',
      ],
      { stripFinalNewline: false }
    );
    mergeResult.output = result.stdout;
    return mergeResult;
  } catch (err: any) {
    if (err.exitCode && Number.isInteger(err.exitCode) && err.stdout) {
      // merge has been succeeded, return the diff results.
      mergeResult.conflict = err.stdout;
      return mergeResult;
    }
    if (err.exitCode && err.exitCode === 255 && err.stderr && err.stderr.includes('Cannot merge binary files')) {
      mergeResult.isBinaryConflict = true;
      return mergeResult;
    }
    if (err.exitCodeName === 'ENOENT') {
      logger.error(`failed running Git at ${gitExecutablePath}. full command: ${err.command}`);
      throw new GitNotFound(gitExecutablePath, err);
    }
    throw new Error(`failed merging "${filePath}" by Git.

${chalk.bold('command:')} ${err.command}
${chalk.bold('message:')} ${err.message}
${chalk.bold('original error:')} ${err.stderr}`);
    throw err;
  }
}
