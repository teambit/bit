// @flow
import execa from 'execa';
import type { PathOsBased } from '../utils/path';
import GeneralError from '../error/general-error';

/**
 * get diff between files using git diff command
 */
export default (async function diffFiles(fileA: PathOsBased, fileB: PathOsBased): Promise<string> {
  try {
    // the --no-index parameter ignores the working tree (in case the project is managed by git)
    const result = await execa('git', ['diff', '--no-index', fileA, fileB]);
    return result.stdout;
  } catch (err) {
    if (err.code && Number.isInteger(err.code) && err.stdout) {
      return err.stdout;
    }
    if (err.code === 'ENOENT') {
      throw new GeneralError('unable to run git diff command, please make sure you have git installed');
    }
    throw err;
  }
});
