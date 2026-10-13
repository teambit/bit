import { types } from 'util';
import { hasRustSnapshotFunctions, hasRustSnapshotTransactionClassConstructor } from '@teambit/objects';
import type AbstractVinyl from './abstract-vinyl';

/** Cache only ordinary path observations; custom readers retain their existing lookup order. */
export function indexRustWorkspaceFiles(
  files: AbstractVinyl[],
  paths: string[]
): Map<string, AbstractVinyl> | undefined {
  if (
    !hasRustSnapshotFunctions(['MergeSourceFilePaths']) ||
    !hasRustSnapshotTransactionClassConstructor('Array', Array)
  )
    return undefined;
  const prototype = files.length && !types.isProxy(files[0]) ? Object.getPrototypeOf(files[0]) : undefined;
  if (prototype && types.isProxy(prototype)) return undefined;
  const constructor = prototype && Object.getOwnPropertyDescriptor(prototype, 'constructor')?.value;
  if (!hasRustSnapshotTransactionClassConstructor('SourceFile', constructor)) return undefined;
  const indexed = new Map<string, AbstractVinyl>();
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    if (types.isProxy(file) || Object.getPrototypeOf(file) !== prototype || !ordinaryPaths(file)) return undefined;
    if (!indexed.has(paths[index])) indexed.set(paths[index], file);
  }
  return indexed;
}

function ordinaryPaths(file: AbstractVinyl): boolean {
  if (['relative', 'path', 'base', 'cwd'].some((key) => Object.hasOwn(file, key))) return false;
  for (const key of ['_base', '_cwd']) {
    const field = Object.getOwnPropertyDescriptor(file, key);
    if (field && (!('value' in field) || (field.value !== undefined && typeof field.value !== 'string'))) return false;
  }
  const history = Object.getOwnPropertyDescriptor(file, 'history')?.value;
  if (!Array.isArray(history) || types.isProxy(history) || Object.getPrototypeOf(history) !== Array.prototype)
    return false;
  const length = Object.getOwnPropertyDescriptor(history, 'length')!.value;
  if (length > 4096 || Reflect.ownKeys(history).length !== length + 1) return false;
  for (let index = 0; index < length; index++) {
    const field = Object.getOwnPropertyDescriptor(history, String(index));
    if (!field || !('value' in field) || typeof field.value !== 'string') return false;
  }
  return true;
}
