import execa from 'execa';

import logger from '../logger/logger';
import { PathOsBased } from '../utils/path';
import GitNotFound from './git/exceptions/git-not-found';
import getGitExecutablePath from './git/git-executable';

/**
 * get diff between files using git diff command
 */
export default (async function diffFiles(fileA: PathOsBased, fileB: PathOsBased, colors = true): Promise<string> {
  const params = ['diff'];
  params.push('--no-index'); // ignores the working tree (in case the project is managed by git)
  if (colors) params.push('--color');
  params.push(fileA);
  params.push(fileB);
  const gitExecutablePath = getGitExecutablePath();
  try {
    const result = await execa(gitExecutablePath, params);
    return result.stdout;
  } catch (err) {
    if (err.exitCode && Number.isInteger(err.exitCode) && err.stdout) {
      // diff has been found, return the diff results.
      return err.stdout;
    }
    if (err.exitCodeName === 'ENOENT') {
      logger.error(`failed running Git at ${gitExecutablePath}. full command: ${err.cmd}`);
      throw new GitNotFound(gitExecutablePath, err);
    }
    throw err;
  }
});
