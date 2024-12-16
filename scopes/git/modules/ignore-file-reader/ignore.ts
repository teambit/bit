import fs from 'fs-extra';
import path from 'path';
import gitignore from 'parse-gitignore';

import { GIT_IGNORE, IGNORE_LIST } from '@teambit/legacy.constants';

export const BIT_IGNORE = '.bitignore';

export async function getGitIgnoreFile(dir: string): Promise<string[]> {
  try {
    const fileContent = await fs.readFile(path.join(dir, GIT_IGNORE));
    return gitignore(fileContent);
  } catch (err: any) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
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
