/** @flow */
import * as path from 'path';
import Scope from './scope';
import { resolveHomePath } from '../utils';

export default function loadScope(currentPath: ?string): Promise<Scope> {
  if (!currentPath) currentPath = process.cwd();
  try {
    return Scope.load(path.resolve(resolveHomePath(currentPath)));
  } catch (err) {
    return Promise.reject(err);
  }
}
