/** @flow */
import * as path from 'path';
import Box from './box';

export default function loadBox(currentPath: ?string) {
  if (!currentPath) currentPath = process.cwd();
  return Box.load(path.resolve(currentPath), false);
}
