import gitignore from 'parse-gitignore';
import { IGNORE_LIST, GIT_IGNORE } from '../../constants';
import { findFile } from '../index';

function getGitIgnoreFile(dir: string) {
  const gitIgnoreFile = findFile(dir, GIT_IGNORE);
  return gitIgnoreFile ? gitignore(gitIgnoreFile) : [];
}

export default function retrieveIgnoreList(cwd: string) {
  const ignoreList = getGitIgnoreFile(cwd).concat(IGNORE_LIST);
  return ignoreList;
}
