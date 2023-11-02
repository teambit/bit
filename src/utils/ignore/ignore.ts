import findUp from 'find-up';
import fs from 'fs-extra';
import path from 'path';
import gitignore from 'parse-gitignore';

import { GIT_IGNORE, IGNORE_LIST } from '../../constants';

export const BIT_IGNORE = '.bitignore';

function getGitIgnoreFile(dir: string): string[] {
  const gitIgnoreFile = findUp.sync([GIT_IGNORE], { cwd: dir });
  return gitIgnoreFile ? gitignore(fs.readFileSync(gitIgnoreFile)) : [];
}

export async function getBitIgnoreFile(dir: string): Promise<string[]> {
  const fileContent = await fs.readFile(path.join(dir, BIT_IGNORE));
  return gitignore(fileContent);
}

export default function retrieveIgnoreList(cwd: string) {
  const ignoreList = getGitIgnoreFile(cwd).concat(IGNORE_LIST);
  return ignoreList;
}
