import { types } from 'util';
import type ModelComponent from '../models/model-component';
import type Version from '../models/version';
import type VersionHistory from '../models/version-history';
import type { VersionParents } from '../models/version-history';
import Ref from './ref';
import type Repository from './repository';
import {
  canHydrateRustHistoryQueryVersions,
  prepareRustHistoryQueryHydration,
  type HistoryHydrationRow,
} from './rust-history-query-hydration';
import { hasRustSnapshotTransactionClass, hasRustSnapshotFunctions } from './rust-snapshot-guards';
import {
  captureRustHistoryQuery,
  captureRustHistoryQueryVersionGuard,
  isRustHistoryQueryOperation,
  retainRustHistoryQueryToken,
  requestRustHistoryQuery,
} from './rust-history-query';

type ParentRow = HistoryHydrationRow & { parents: string[]; unrelated?: string; squashed?: string[] };
type MissingRow = { hash: string; parentOf: string; kind: 'parent' | 'tag'; tag?: string };
type Population = {
  token: string;
  added: ParentRow[];
  missing: MissingRow[];
  complete: boolean;
  lastErrorIndex?: number;
};
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

function captureHistory(history: VersionHistory) {
  if (
    types.isProxy(history) ||
    !hasRustSnapshotTransactionClass(history, 'VersionHistory') ||
    !hasRustSnapshotFunctions(['SnapshotHistoryObject'])
  )
    return undefined;
  const map = Object.getOwnPropertyDescriptor(history, 'versionsObj')?.value;
  if (!map || types.isProxy(map) || ![Object.prototype, null].includes(Object.getPrototypeOf(map))) return undefined;
  const fields = Object.getOwnPropertyDescriptors(map);
  if (
    Reflect.ownKeys(fields).length > 4096 ||
    Reflect.ownKeys(fields).some((key) => typeof key !== 'string' || !('value' in Reflect.get(fields, key)))
  )
    return undefined;
  const rows = history.versions;
  if (rows.length > 4096) return undefined;
  const result: string[] = [];
  const aliases: unknown[] = [map];
  const descriptors: PropertyDescriptor[] = [Object.getOwnPropertyDescriptor(history, 'versionsObj')!];
  for (const row of rows) {
    if (!row || types.isProxy(row) || Object.getPrototypeOf(row) !== Object.prototype) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(row, 'hash');
    const ref = descriptor?.value;
    if (!ref || types.isProxy(ref) || !hasRustSnapshotTransactionClass(ref, 'Ref')) return undefined;
    const value = Object.getOwnPropertyDescriptor(ref, 'hash')?.value;
    if (!hash(value)) return undefined;
    result.push(value);
    aliases.push(row, ref);
    descriptors.push(descriptor!, Object.getOwnPropertyDescriptor(ref, 'hash')!);
  }
  return { hashes: result, aliases, descriptors };
}

function sameDescriptor(before: PropertyDescriptor, after: PropertyDescriptor): boolean {
  return (
    Reflect.ownKeys(before).length === Reflect.ownKeys(after).length &&
    Reflect.ownKeys(before).every((key) => Reflect.get(before, key) === Reflect.get(after, key))
  );
}

/** Called inside the original mutex after its canonical head load; a decline retains that same continuation. */
export async function populateRustHistoryQuery(
  model: ModelComponent,
  repository: Repository,
  history: VersionHistory,
  head: Ref,
  headVersion: Version,
  headExists: boolean,
  exitWhenFind: boolean
): Promise<{ added: VersionParents[]; missing: MissingRow[] } | undefined> {
  if (!isRustHistoryQueryOperation() || !canHydrateRustHistoryQueryVersions()) return undefined;
  if (types.isProxy(head) || !hasRustSnapshotTransactionClass(head, 'Ref')) return undefined;
  const headHash = Object.getOwnPropertyDescriptor(head, 'hash')?.value;
  const capture = captureRustHistoryQuery(repository, model);
  const headCapture = captureRustHistoryQueryVersionGuard(headVersion);
  const before = captureHistory(history);
  if (!hash(headHash) || !capture || !headCapture || !before || headCapture.metadata.hash !== headHash)
    return undefined;
  const result = await requestRustHistoryQuery<Population>(
    {
      kind: 'historyQueryPopulateBegin',
      objectsDirectory: capture.objectsDirectory,
      head: headHash,
      headExists,
      exitWhenFind,
      existing: before.hashes,
      headData: headCapture.metadata,
      overlays: capture.overlays,
      tags: capture.tags,
      orphaned: capture.orphaned,
      ...(capture.lastFoundTag === undefined ? {} : { lastFoundTag: capture.lastFoundTag }),
    },
    (data) => {
      if (
        !hash(data?.token) ||
        !Array.isArray(data.added) ||
        data.added.length > 4096 ||
        !Array.isArray(data.missing) ||
        data.missing.length > 4096 ||
        data.complete !== !data.missing.length
      )
        return false;
      for (const row of data.added) {
        if (row.hash !== headHash && row.overlayIndex === undefined && typeof row.versionJSON !== 'string')
          return false;
        if (!hash(row?.hash) || !Array.isArray(row.parents) || row.parents.length > 4096 || !row.parents.every(hash))
          return false;
        if (row.unrelated !== undefined && !hash(row.unrelated)) return false;
        if (
          row.squashed !== undefined &&
          (!Array.isArray(row.squashed) || row.squashed.length > 4096 || !row.squashed.every(hash))
        )
          return false;
        if (
          row.overlayIndex !== undefined &&
          (!Number.isSafeInteger(row.overlayIndex) ||
            row.overlayIndex < 0 ||
            row.overlayIndex >= capture.versions.length ||
            capture.overlays[row.overlayIndex].hash !== row.hash)
        )
          return false;
      }
      for (const row of data.missing) {
        if (!hash(row?.hash) || !hash(row.parentOf) || !['parent', 'tag'].includes(row.kind)) return false;
        if (row.tag !== undefined && typeof row.tag !== 'string') return false;
      }
      return data.missing.length ? data.lastErrorIndex === data.missing.length - 1 : data.lastErrorIndex === undefined;
    }
  );
  if (!result) return undefined;
  if (!retainRustHistoryQueryToken(result.token)) return undefined;
  if (!capture.fresh() || !headCapture.fresh()) return undefined;
  const after = captureHistory(history);
  if (
    !after ||
    JSON.stringify(after.hashes) !== JSON.stringify(before.hashes) ||
    after.aliases.length !== before.aliases.length ||
    after.aliases.some((alias, index) => alias !== before.aliases[index]) ||
    after.descriptors.some((descriptor, index) => !sameDescriptor(before.descriptors[index], descriptor))
  )
    return undefined;
  const hydration = prepareRustHistoryQueryHydration(repository, capture, result.added, {
    hash: headHash,
    version: headVersion,
  });
  const versions = hydration?.apply();
  if (!versions || versions.some((version) => !version)) return undefined;
  const added = result.added.map((row, index): VersionParents => {
    const version = versions[index];
    return {
      hash: Ref.from(row.hash),
      parents: version ? version.parents : row.parents.map(Ref.from),
      ...(row.unrelated === undefined ? {} : { unrelated: version?.unrelated?.head || Ref.from(row.unrelated) }),
      ...(row.squashed === undefined
        ? {}
        : { squashed: version?.squashed?.previousParents || row.squashed.map(Ref.from) }),
    };
  });
  return { added, missing: result.missing };
}
