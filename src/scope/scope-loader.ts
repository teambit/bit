import * as path from 'path';

import { resolveHomePath } from '../utils';
import { ScopeNotFound } from './exceptions';
import Scope from './scope';

export default function loadScope(currentPath?: string | null | undefined, useCache = true): Promise<Scope> {
  if (!currentPath) currentPath = process.cwd();
  try {
    return Scope.load(path.resolve(resolveHomePath(currentPath)), useCache);
  } catch (err) {
    return Promise.reject(err);
  }
}

export async function loadScopeIfExist(
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  currentPath?: string | null | undefined = process.cwd(),
  useCache = true
): Promise<Scope | undefined> {
  try {
    return await loadScope(currentPath, useCache);
  } catch (err) {
    if (err instanceof ScopeNotFound) {
      return undefined;
    }
    throw err;
  }
}
