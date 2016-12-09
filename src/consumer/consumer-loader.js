/** @flow */
import * as path from 'path';
import Box from './consumer';

export default function loadContainer(currentPath: ?string) {
  if (!currentPath) currentPath = process.cwd();
  return Box.load(path.resolve(currentPath), false);
}
