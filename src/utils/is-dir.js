/** @flow */
import fs from 'fs';

export default function isDir(userPath: string): boolean {
  let stat;
  try {
    stat = fs.lstatSync(userPath);
  } catch (err) {
    throw new Error(`The path ${userPath} doesn't exist`);
  }
  return stat.isDirectory();
}
