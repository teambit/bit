import findUp from 'find-up';
import fs from 'fs-extra';
import gitignore from 'parse-gitignore';

import { GIT_IGNORE, IGNORE_LIST } from '../../constants';

function getGitIgnoreFile(dir: string) {
  const gitIgnoreFile = findUp.sync([GIT_IGNORE], { cwd: dir });
  return gitIgnoreFile ? gitignore(fs.readFileSync(gitIgnoreFile)) : [];
}

export default function retrieveIgnoreList(cwd: string) {
  const ignoreList = getGitIgnoreFile(cwd).concat(IGNORE_LIST);
  return ignoreList;
}
