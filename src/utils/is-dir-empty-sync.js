/** @flow */
import fs from 'fs-extra';

export default function isDirEmptySync(dirPath: string): boolean {
  return !fs.readdirSync(dirPath).length;
}
