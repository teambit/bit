import * as path from 'path';

import { resolveHomePath } from '@teambit/legacy.utils';
import { ScopeNotFound } from './exceptions';
import Scope from './scope';

export default function loadScope(currentPath?: string | null | undefined, useCache = true): Promise<Scope> {
  if (!currentPath) currentPath = process.cwd();
  return Scope.load(path.resolve(resolveHomePath(currentPath)), useCache);
}

export async function loadScopeIfExist(
  currentPath: string | null | undefined = process.cwd(),
  useCache = true
): Promise<Scope | undefined> {
  try {
    return await loadScope(currentPath, useCache);
  } catch (err: any) {
    if (err instanceof ScopeNotFound) {
      return undefined;
    }
    throw err;
  }
}
