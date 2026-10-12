import type Version from '../models/version';
import type Repository from './repository';
import { types } from 'util';
import { hasRustSnapshotTransactionClassFields, hasRustSnapshotFunctionReference } from './rust-snapshot-guards';
import type { SourceFile } from '@teambit/component.sources';
import {
  captureRustHistoryQueryVersionGuard, captureRustHistoryQueryObjects,
  getRustHistoryQueryLogToken, requestRustHistoryQuery, type HistoryQueryOverlay,
  canUseRustHistoryQueryRepository,
  getRustHistoryQuerySourceDirectory,
} from './rust-history-query';
import { canHydrateRustHistoryQuerySources, validRustHistorySourceReceipt, hydrateRustHistoryQuerySources, type HistorySourceReceipt } from './rust-history-query-sources';

const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
export type HistoryFileLog = {
  hash: string; fileHash: string; parentFileHash?: string; parentHashes?: string[];
  username?: string; email?: string; date: string; message: string; tag?: string; hidden?: boolean;
};
export type HistoryFileCapture = { overlay: HistoryQueryOverlay; fresh: () => boolean };

function dataRecord(value: any): PropertyDescriptorMap | undefined {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype)
    return undefined;
  const fields = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(fields).every((key) => typeof key === 'string' && 'value' in Reflect.get(fields, key)) ? fields : undefined;
}

function ordinaryArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || types.isProxy(value) || value.length > 4096 ||
    !hasRustSnapshotTransactionClassFields(value, 'Array', [])) return false;
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).length !== value.length + 1) return false;
  for (let index = 0; index < value.length; index++) if (!fields[index] || !('value' in fields[index])) return false;
  return true;
}

type HistoryDiff = HistorySourceReceipt & {
  leftLinuxHash?: string; rightLinuxHash?: string; needsDiff: boolean;
  files: Array<{ relativePath: string; rawDiff: string; same: boolean }>;
};

/** The actual workspace.get callbacks have returned; default lazy bodies stay in the repository engine. */
export async function getRustHistoryFileDiff(repository: Repository, right: SourceFile, left?: SourceFile) {
  const token = getRustHistoryQueryLogToken();
  if (!token || !canUseRustHistoryQueryRepository(repository) || !canHydrateRustHistoryQuerySources()) return undefined;
  const diffModule = require('@teambit/legacy.component-diff/dist/components-diff.js');
  const formatter = Object.getOwnPropertyDescriptor(diffModule, 'formatFileDiff')?.value;
  if (!hasRustSnapshotFunctionReference('HistoryQueryFormatFilesDiff', formatter)) return undefined;
  const vinylModule = require('@teambit/component.sources/dist/abstract-vinyl.js');
  const sourceModule = require('@teambit/component.sources/dist/rust-checkout-source.js');
  const vinylGuard = Object.getOwnPropertyDescriptor(vinylModule, 'canUseDefaultVinylToSourceNatively')?.value;
  const descriptorReader = Object.getOwnPropertyDescriptor(sourceModule, 'getRustHistorySourceDescriptor')?.value;
  if (!hasRustSnapshotFunctionReference('HistoryQueryVinylIdentity', vinylGuard) ||
    !hasRustSnapshotFunctionReference('HistoryQuerySourceDescriptor', descriptorReader)) return undefined;
  if (!vinylGuard(right) || (left && !vinylGuard(left))) return undefined;
  const rightDescriptor = descriptorReader(right, repository);
  const leftDescriptor = left && descriptorReader(left, repository);
  if (!rightDescriptor || (left && !leftDescriptor)) return undefined;
  const relativePath = right.relative;
  const objectsDirectory = repository.getPath();
  const snapshotDirectory = await getRustHistoryQuerySourceDirectory();
  if (!snapshotDirectory) return undefined;
  const input = {
    kind: 'historyQueryDiff', token, objectsDirectory, snapshotDirectory, relativePath, right: rightDescriptor.hash,
    ...(leftDescriptor ? { left: leftDescriptor.hash } : {}), color: true,
  };
  const valid = (data: any): boolean => Boolean(
    data && validRustHistorySourceReceipt(data, snapshotDirectory) && hash(data.rightLinuxHash) && (data.leftLinuxHash === undefined || hash(data.leftLinuxHash)) &&
    typeof data.needsDiff === 'boolean' && Array.isArray(data.files) && data.files.length <= 1 &&
    data.files.every((row: any) => row.relativePath === relativePath && typeof row.rawDiff === 'string' && typeof row.same === 'boolean')
  );
  const fresh = () => hasRustSnapshotFunctionReference('HistoryQueryFormatFilesDiff', Object.getOwnPropertyDescriptor(diffModule, 'formatFileDiff')?.value) &&
    hasRustSnapshotFunctionReference('HistoryQueryVinylIdentity', Object.getOwnPropertyDescriptor(vinylModule, 'canUseDefaultVinylToSourceNatively')?.value) &&
    hasRustSnapshotFunctionReference('HistoryQuerySourceDescriptor', Object.getOwnPropertyDescriptor(sourceModule, 'getRustHistorySourceDescriptor')?.value) &&
    canUseRustHistoryQueryRepository(repository) && vinylGuard(right) && (!left || vinylGuard(left)) &&
    descriptorReader(right, repository)?.hash === rightDescriptor.hash &&
    (!left || descriptorReader(left, repository)?.hash === leftDescriptor.hash) && right.relative === relativePath &&
    repository.getPath() === objectsDirectory;
  let result = await requestRustHistoryQuery<HistoryDiff>(input, valid);
  if (!result || !fresh()) return undefined;
  if (!await hydrateRustHistoryQuerySources(repository, result) || !fresh()) return undefined;
  if (result.needsDiff) {
    const publicDiff = Object.getOwnPropertyDescriptor(diffModule, 'getFilesDiff')?.value;
    if (!hasRustSnapshotFunctionReference('HistoryQueryPublicFilesDiff', publicDiff)) return undefined;
    const gitModule = require('@teambit/git.modules.git-executable/dist/git-executable.js');
    const gitGuard = Object.getOwnPropertyDescriptor(gitModule, 'canUseDefaultGitNatively')?.value;
    if (!hasRustSnapshotFunctionReference('HistoryQueryGitEligibility', gitGuard) || !gitGuard()) return undefined;
    result = await requestRustHistoryQuery<HistoryDiff>({ ...input, gitExecutable: 'git' }, valid);
    if (!result || result.needsDiff || !fresh()) return undefined;
    if (!await hydrateRustHistoryQuerySources(repository, result) || !fresh()) return undefined;
  }
  return result;
}

/** Called after the original Version load callback, never instead of that callback. */
export function captureRustHistoryFileVersion(version: Version): HistoryFileCapture | undefined {
  const versionGuard = captureRustHistoryQueryVersionGuard(version);
  if (!versionGuard) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(version, 'files');
  if (!descriptor || !('value' in descriptor)) return undefined;
  const files = descriptor.value;
  if (types.isProxy(files) || !Array.isArray(files) || files.length > 4096 ||
    !hasRustSnapshotTransactionClassFields(files, 'Array', [])) return undefined;
  const fields = Object.getOwnPropertyDescriptors(files);
  if (Reflect.ownKeys(fields).length !== files.length + 1) return undefined;
  const snapshots: Array<{ row: object; fields: PropertyDescriptorMap; ref: object; hash: string }> = [];
  const projected: NonNullable<HistoryQueryOverlay['files']> = [];
  for (let index = 0; index < files.length; index++) {
    const row = fields[index]?.value;
    const rowFields = dataRecord(row);
    if (!rowFields) return undefined;
    const ref = rowFields.file?.value;
    if (!ref || types.isProxy(ref) || !hasRustSnapshotTransactionClassFields(ref, 'Ref', ['hash'])) return undefined;
    const file = Object.getOwnPropertyDescriptor(ref, 'hash')?.value;
    const relativePath = rowFields.relativePath?.value;
    const name = rowFields.name?.value;
    const test = rowFields.test?.value;
    if (!hash(file) || typeof relativePath !== 'string' || (name !== undefined && typeof name !== 'string') ||
      (test !== undefined && typeof test !== 'boolean')) return undefined;
    projected[index] = { file, relativePath, ...(name === undefined ? {} : { name }), ...(test === undefined ? {} : { test }) };
    snapshots[index] = { row, fields: rowFields, ref, hash: file };
  }
  return {
    overlay: { ...versionGuard.metadata, files: projected },
    fresh: () => {
      if (!versionGuard.fresh() || Object.getOwnPropertyDescriptor(version, 'files')?.value !== files || files.length !== snapshots.length)
        return false;
      for (let index = 0; index < snapshots.length; index++) {
        const saved = snapshots[index];
        if (Object.getOwnPropertyDescriptor(files, String(index))?.value !== saved.row) return false;
        const live = dataRecord(saved.row);
        if (!live || Reflect.ownKeys(live).length !== Reflect.ownKeys(saved.fields).length) return false;
        for (const key of Reflect.ownKeys(saved.fields)) {
          const before = Reflect.get(saved.fields, key);
          const after = Reflect.get(live, key);
          if (!after || !Reflect.ownKeys(before).every((field) => Reflect.get(before, field) === Reflect.get(after, field))) return false;
        }
        if (!hasRustSnapshotTransactionClassFields(saved.ref, 'Ref', ['hash']) ||
          Object.getOwnPropertyDescriptor(saved.ref, 'hash')?.value !== saved.hash) return false;
      }
      return true;
    },
  };
}

function primitiveLog(log: HistoryFileLog): Record<string, unknown> | undefined {
  const fields = dataRecord(log);
  if (!fields) return undefined;
  const result: Record<string, unknown> = Object.create(null);
  const permitted = ['hash', 'fileHash', 'parentFileHash', 'parentHashes', 'username', 'email', 'date', 'message', 'tag', 'hidden'];
  for (const key of Reflect.ownKeys(fields)) {
    if (typeof key !== 'string' || !permitted.includes(key)) continue;
    const value = Reflect.get(fields, key).value;
    if (value === undefined) continue;
    if (key === 'parentHashes') {
      if (!ordinaryArray(value)) return undefined;
      for (let index = 0; index < value.length; index++) if (!hash(value[index])) return undefined;
    } else if (value !== null && !['string', 'boolean', 'number'].includes(typeof value)) return undefined;
    Object.defineProperty(result, key, { value, enumerable: true, writable: true, configurable: true });
  }
  return result;
}

function sameDataDescriptors(value: object, saved: object): boolean {
  if (types.isProxy(value)) return false;
  const live = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(saved);
  if (Reflect.ownKeys(live).length !== keys.length) return false;
  return keys.every((key) => {
    const before = Reflect.get(saved, key);
    const after = Reflect.get(live, key);
    return after && 'value' in after && before.value === after.value &&
      before.writable === after.writable && before.enumerable === after.enumerable && before.configurable === after.configurable;
  });
}

/** Preserve shallow public metadata aliases while guarding reads and spreads after asynchronous receipts. */
function captureLogs(logs: HistoryFileLog[]) {
  if (!ordinaryArray(logs)) return undefined;
  const arrayFields = Object.getOwnPropertyDescriptors(logs);
  const rows = logs.map((log) => {
    const fields = dataRecord(log);
    const input = fields && primitiveLog(log);
    if (!fields || !input) return undefined;
    const parents = fields.parentHashes?.value;
    return { log, fields, input, parents, parentFields: parents && Object.getOwnPropertyDescriptors(parents) };
  });
  if (rows.some((row) => !row)) return undefined;
  return {
    input: rows.map((row) => row!.input),
    fresh: () => ordinaryArray(logs) && sameDataDescriptors(logs, arrayFields) && rows.every((row) =>
      row && Object.getPrototypeOf(row.log) === Object.prototype && sameDataDescriptors(row.log, row.fields) &&
      (!row.parents || (ordinaryArray(row.parents) && sameDataDescriptors(row.parents, row.parentFields!)))),
  };
}

export async function getRustHistoryFileLineage(relativePath: string, logs: HistoryFileLog[], captures: HistoryFileCapture[]) {
  const token = getRustHistoryQueryLogToken();
  if (!token || !ordinaryArray(logs) || !ordinaryArray(captures) || captures.some((capture) => !capture.fresh())) return undefined;
  const capturedLogs = captureLogs(logs);
  if (!capturedLogs) return undefined;
  const inputLogs = capturedLogs.input;
  const result = await requestRustHistoryQuery<{ logs: Array<HistoryFileLog & { logIndex: number }> }>({
    kind: 'historyQueryFiles', token, relativePath, logs: inputLogs,
    overlays: captures.map((capture) => capture.overlay),
  }, (data) => Array.isArray(data?.logs) && data.logs.length <= logs.length && data.logs.every((log: any) =>
    hash(log?.hash) && hash(log.fileHash) && (log.parentFileHash === undefined || hash(log.parentFileHash)) &&
    Array.isArray(log.parentHashes) && log.parentHashes.every(hash) &&
    Number.isSafeInteger(log.logIndex) && log.logIndex >= 0 && log.logIndex < inputLogs.length && inputLogs[log.logIndex].hash === log.hash));
  if (!result || !capturedLogs.fresh() || captures.some((capture) => !capture.fresh())) return undefined;
  return result.logs.map((row) => ({
    ...logs[row.logIndex],
    fileHash: row.fileHash, parentFileHash: row.parentFileHash, parentHashes: row.parentHashes,
  }));
}

export async function getRustHistoryBlame(repository: Repository, logs: HistoryFileLog[]) {
  const token = getRustHistoryQueryLogToken();
  if (!token || !ordinaryArray(logs) || !canHydrateRustHistoryQuerySources()) return undefined;
  const objects = captureRustHistoryQueryObjects(repository);
  if (!token || !objects) return undefined;
  const capturedLogs = captureLogs(logs);
  if (!capturedLogs) return undefined;
  const inputLogs = capturedLogs.input;
  const requested = new Set<string>();
  for (let index = 0; index < inputLogs.length; index++) {
    const log = inputLogs[index]!;
    if (!hash(log.fileHash) || (log.parentFileHash !== undefined && !hash(log.parentFileHash))) return undefined;
    requested.add(log.fileHash);
    if (log.parentFileHash) requested.add(log.parentFileHash as string);
  }
  if (objects.some(([key]) => requested.has(key))) return undefined;
  const snapshotDirectory = await getRustHistoryQuerySourceDirectory();
  if (!snapshotDirectory) return undefined;
  const result = await requestRustHistoryQuery<HistorySourceReceipt & { lines: Array<{ lineNumber: number; lineContent: string; previousLineContent?: string; logIndex: number }> }>({
    kind: 'historyQueryBlame', token, objectsDirectory: repository.getPath(), snapshotDirectory, logs: inputLogs,
  }, (data) => validRustHistorySourceReceipt(data, snapshotDirectory) && Array.isArray(data?.lines) && data.lines.length <= 65536 && data.lines.every((line: any, index: number) =>
    line.lineNumber === index + 1 && typeof line.lineContent === 'string' &&
    (line.previousLineContent === undefined || typeof line.previousLineContent === 'string') &&
    Number.isSafeInteger(line.logIndex) && line.logIndex >= 0 && line.logIndex < logs.length));
  if (!result || !capturedLogs.fresh()) return undefined;
  const current = captureRustHistoryQueryObjects(repository);
  if (!current || current.some(([key]) => requested.has(key))) return undefined;
  if (!await hydrateRustHistoryQuerySources(repository, result) || !capturedLogs.fresh()) return undefined;
  return result.lines.map((line) => {
    const log = logs[line.logIndex];
    return {
      lineNumber: line.lineNumber, lineContent: line.lineContent,
      username: log.username, email: log.email, date: log.date, message: log.message, hash: log.hash, tag: log.tag,
      ...(line.previousLineContent === undefined ? {} : { previousLineContent: line.previousLineContent }),
    };
  });
}
