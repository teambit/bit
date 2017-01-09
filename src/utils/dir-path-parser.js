/** @flow */
import path from 'path';

export default function parseDirPath(dirPath: string) {
  return path.parse(dirPath).dir.split(path.delimiter);
}
