import * as path from 'path';

/**
 * parse given dir path
 * @param {*} dirPath
 */
export default function parseDirPath(dirPath: string) {
  return path.parse(dirPath).dir.split(path.delimiter);
}
