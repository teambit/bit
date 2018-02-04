/** @flow */
import * as path from 'path';
import fs from 'fs-extra';
import Scope from './scope';
import { resolveHomePath } from '../utils';
import { BIT_GIT_DIR, DOT_GIT_FOLDER } from '../constants';

export default function loadScope(currentPath: ?string): Promise<Scope> {
  if (!currentPath) currentPath = process.cwd();
  try {
    const resolvedPath = path.resolve(resolveHomePath(currentPath));
    const gitDir = path.join(resolvedPath, DOT_GIT_FOLDER, BIT_GIT_DIR, BIT_GIT_DIR);
    return Scope.load(fs.existsSync(gitDir) ? gitDir : resolvedPath);
  } catch (err) {
    return Promise.reject(err);
  }
}
