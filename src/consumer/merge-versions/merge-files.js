// @flow
import execa from 'execa';
import type { PathOsBased } from '../../utils/path';

/**
 * use git `merge-file` command. From the command help:
 * `git merge-file <current-file> <base-file> <other-file>
 * git merge-file incorporates all changes that lead from the <base-file> to <other-file> into
 * <current-file>. The result ordinarily goes into <current-file>.`
 *
 * Here, we are not going to write the result into current-file. Instead, we'll use the "-p" flag,
 * to just return the results.
 */
export default (async function mergeFiles(
  filePath: string,
  currentFile: PathOsBased,
  baseFile: PathOsBased,
  otherFile: PathOsBased
) {
  const mergeResult = { filePath, output: null, conflict: null };
  try {
    const result = await execa('git', ['merge-file', currentFile, baseFile, otherFile, '-p']);
    mergeResult.output = result.stdout;
    return mergeResult;
  } catch (err) {
    if (err.code === 1 && err.stdout) {
      mergeResult.conflict = err.stdout;
      return mergeResult;
    }
    if (err.code === 'ENOENT') {
      throw new Error('unable to run git merge-file command, please make sure you have git installed');
    }
    throw err;
  }
});
