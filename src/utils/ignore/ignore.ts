import findUp from 'find-up';
import fs from 'fs-extra';
import path from 'path';
import gitignore from 'parse-gitignore';

import { GIT_IGNORE, IGNORE_LIST } from '../../constants';

export const BIT_IGNORE = '.bitignore';

async function getGitIgnoreFile(dir: string): Promise<string[]> {
  const gitIgnoreFile = findUp.sync([GIT_IGNORE], { cwd: dir });
  return gitIgnoreFile ? gitignore(await fs.readFile(gitIgnoreFile)) : [];
}

async function isBitIgnoreFileExistsInDir(dir: string): Promise<boolean> {
  return fs.pathExists(path.join(dir, BIT_IGNORE));
}

export async function getBitIgnoreFile(dir: string): Promise<string[]> {
  const fileContent = await fs.readFile(path.join(dir, BIT_IGNORE));
  return gitignore(fileContent);
}

export async function retrieveIgnoreList(consumerRoot: string): Promise<string[]> {
  const userIgnoreList = (await isBitIgnoreFileExistsInDir(consumerRoot))
    ? await getBitIgnoreFile(consumerRoot)
    : await getGitIgnoreFile(consumerRoot);
  return [...userIgnoreList, ...IGNORE_LIST];
}
