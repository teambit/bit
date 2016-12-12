/** @flow */
import * as path from 'path';
import Scope from './scope';

export default function loadScope(currentPath: ?string) {
  if (!currentPath) currentPath = process.cwd();
  return Scope.load(path.resolve(currentPath));
}
