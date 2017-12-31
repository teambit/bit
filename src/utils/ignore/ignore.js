import gitignore from 'parse-gitignore';
import { BIT_JSON, BIT_MAP, GIT_IGNORE } from '../../constants';
import { findFile } from '../index';

function getGitIgnoreFile(dir: string) {
  const gitIgnoreFile = findFile(dir, GIT_IGNORE);
  return gitIgnoreFile ? gitignore(gitIgnoreFile) : [];
}

export default function retrieveIgnoreList(cwd: string) {
  const ignoreList = getGitIgnoreFile(cwd).concat([BIT_JSON, BIT_MAP, GIT_IGNORE]);
  return ignoreList;
}
