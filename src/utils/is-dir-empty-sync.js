/** @flow */
import fs from 'fs';

export default function isDirEmptySync(dirPath: string): boolean {
  return !fs.readdirSync(dirPath).length;
}
