/** @flow */
import * as path from 'path';
import Scope from './scope';
import { resolveHomePath } from '../utils';

export default function loadScope(currentPath: ?string): Promise<Scope> {
  if (!currentPath) currentPath = process.cwd();
  return Scope.load(path.resolve(resolveHomePath(currentPath)));
}
