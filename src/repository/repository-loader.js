/** @flow */
import * as path from 'path';
import Repository from './repository';

export default function loadRepository(currentPath: ?string) {
  if (!currentPath) currentPath = process.cwd();
  return Repository.load(path.resolve(currentPath), false);
}
