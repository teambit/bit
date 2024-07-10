import fs from 'fs-extra';

import { BitError } from '@teambit/bit-error';

export default function isDir(userPath: string): boolean {
  let stat;
  try {
    stat = fs.lstatSync(userPath);
  } catch (err: any) {
    throw new BitError(`The path ${userPath} doesn't exist`);
  }
  return stat.isDirectory();
}
