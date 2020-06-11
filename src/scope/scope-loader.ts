import * as path from 'path';
import Scope from './scope';
import { resolveHomePath } from '../utils';
import { ScopeNotFound } from './exceptions';

export default function loadScope(currentPath?: string | null | undefined): Promise<Scope> {
  if (!currentPath) currentPath = process.cwd();
  try {
    return Scope.load(path.resolve(resolveHomePath(currentPath)));
  } catch (err) {
    return Promise.reject(err);
  }
}

export async function loadScopeIfExist(
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  currentPath?: string | null | undefined = process.cwd()
): Promise<Scope | undefined> {
  try {
    return await loadScope(currentPath);
  } catch (err) {
    if (err instanceof ScopeNotFound) {
      return undefined;
    }
    throw err;
  }
}
