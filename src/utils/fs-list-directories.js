/** @flow */
import path from 'path';
import fs from 'fs';

export default function listDirectories(dirPath: string): string[] {
  return fs.readdirSync(dirPath).filter((file) => {
    return fs.statSync(path.join(dirPath, file)).isDirectory();
  });
}
