import path from 'path';
import { types } from 'util';
import { hasRustSnapshotTransactionClass, hasRustSnapshotTransactionClassFieldsBatch } from '@teambit/objects';
import type SourceFile from './source-file';
import { getRustCheckoutSourceDescriptors } from './rust-checkout-source';
import { getRustWorkspaceMergeDescriptor } from './rust-workspace-identity';
import { compareRustFileStatuses } from './rust-workspace-reader';

type Row = { relativePath: string; hash: string };
const isBuffer = Buffer.isBuffer;
const equals = Buffer.prototype.equals;
const stringify = JSON.stringify;
const pathRelative = path.relative;
const pathResolve = path.resolve;

function project(files: SourceFile[]): Row[] | undefined {
  if (
    !hasRustSnapshotTransactionClass(files, 'Array') ||
    files.length > 4096 ||
    Reflect.ownKeys(files).length !== files.length + 1 ||
    Object.getOwnPropertyDescriptor(path, 'relative')?.value !== pathRelative ||
    Object.getOwnPropertyDescriptor(path, 'resolve')?.value !== pathResolve ||
    Object.getOwnPropertyDescriptor(Buffer, 'isBuffer')?.value !== isBuffer ||
    Object.getOwnPropertyDescriptor(Buffer.prototype, 'equals')?.value !== equals
  )
    return undefined;
  const descriptors = getRustCheckoutSourceDescriptors(files);
  if (!descriptors) return undefined;
  const histories = files.map((file) => Object.getOwnPropertyDescriptor(file, 'history')?.value);
  if (!hasRustSnapshotTransactionClassFieldsBatch(histories, 'Array', [])) return undefined;
  const rows: Row[] = [];
  for (const [index, file] of files.entries()) {
    if (
      ['_base', '_cwd'].some((key) => {
        const value = Object.getOwnPropertyDescriptor(file, key)?.value;
        return value !== undefined && typeof value !== 'string';
      })
    )
      return undefined;
    const history = histories[index];
    const fields = Object.getOwnPropertyDescriptors(history);
    if (
      history.length > 4096 ||
      Reflect.ownKeys(history).length !== history.length + 1 ||
      !Array.from({ length: history.length }, (_, at) => fields[at]).every(
        (field) => field && 'value' in field && typeof field.value === 'string'
      )
    )
      return undefined;
    const body = Object.getOwnPropertyDescriptor(file, '_contents')?.value;
    if (
      !body ||
      types.isProxy(body) ||
      !isBuffer(body) ||
      Object.getPrototypeOf(body) !== Buffer.prototype ||
      ['equals', 'length', 'byteLength', 'byteOffset', 'buffer'].some((key) => Object.hasOwn(body, key))
    )
      return undefined;
    const source = descriptors[index];
    const workspace = source ? undefined : getRustWorkspaceMergeDescriptor(file, true);
    const hash = source?.hash || workspace?.snapshotHash || workspace?.hash;
    if (!hash) return undefined;
    rows.push({ relativePath: file.relative, hash });
  }
  return rows;
}

/** Batch first-match status decisions without crossing public getters or retaining stale file snapshots. */
export async function getRustFileStatuses(
  target: SourceFile[],
  current: SourceFile[]
): Promise<Array<{ relativePath: string; unchanged: boolean }> | undefined> {
  if (
    process.env.BIT_RUST_CLIENT_VCS !== 'on' ||
    Object.getOwnPropertyDescriptor(JSON, 'stringify')?.value !== stringify ||
    Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON') ||
    Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON')
  )
    return undefined;
  const targetRows = project(target),
    currentRows = project(current);
  if (!targetRows || !currentRows) return undefined;
  const result = await compareRustFileStatuses(targetRows, currentRows);
  if (!result) return undefined;
  const same = (before: Row[], after: Row[] | undefined) =>
    after?.length === before.length &&
    before.every((row, index) => row.relativePath === after[index].relativePath && row.hash === after[index].hash);
  if (!same(targetRows, project(target)) || !same(currentRows, project(current))) return undefined;
  return targetRows.map((row, index) => ({ relativePath: row.relativePath, unchanged: result[index] }));
}
