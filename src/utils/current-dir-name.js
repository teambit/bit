/** @flow */
import path from 'path';

export default function currentDirName(): string {
  const currentDir = process.cwd();
  return path.parse(currentDir).name;
}
