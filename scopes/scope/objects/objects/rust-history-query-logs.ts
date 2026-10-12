import type ModelComponent from '../models/model-component';
import type Repository from './repository';
import type Version from '../models/version';
import Ref from './ref';
import { HeadNotFound, ParentNotFound, VersionNotFound } from '@teambit/legacy.scope';
import { hasRustSnapshotFunctions, hasRustSnapshotTransactionClassFields } from './rust-snapshot-guards';
import { canHydrateRustHistoryQueryVersions, prepareRustHistoryQueryHydration, type HistoryHydrationRow } from './rust-history-query-hydration';
import { captureRustHistoryQuery, requestRustHistoryQuery, retainRustHistoryQueryToken, rememberRustHistoryQueryLogToken } from './rust-history-query';

type QueryRow = HistoryHydrationRow & {
  hash: string;
  parents: string[];
  onLane: boolean;
  isPartOfHistory?: true;
  tag?: string;
  log?: Record<string, any>;
  hidden?: boolean;
  overlayIndex?: number;
  missing?: { kind: 'head' | 'parent' | 'tag'; parentOf?: string };
};
type QueryResult = { token: string; rows: QueryRow[]; complete: boolean; lastFoundTag?: string };
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

function validRow(row: any): row is QueryRow {
  return Boolean(
    row && hash(row.hash) && Array.isArray(row.parents) && row.parents.length <= 4096 && row.parents.every(hash) &&
    typeof row.onLane === 'boolean' && (row.isPartOfHistory === undefined || row.isPartOfHistory === true) &&
    (row.tag === undefined || typeof row.tag === 'string') &&
    (row.hidden === undefined || typeof row.hidden === 'boolean') &&
    (!row.missing || (['head', 'parent', 'tag'].includes(row.missing.kind) &&
      (row.missing.parentOf === undefined || hash(row.missing.parentOf))))
  );
}

/** Own the verified closure and mirror Version cache effects before later public metadata callbacks. */
export async function getRustHistoryQueryLogVersions(model: ModelComponent, repository: Repository, startFrom?: Ref) {
  rememberRustHistoryQueryLogToken(undefined);
  if (!canHydrateRustHistoryQueryVersions()) return undefined;
  const capture = captureRustHistoryQuery(repository, model);
  if (!capture || !hasRustSnapshotFunctions(['HistoryResetModelLodash'])) return undefined;
  const cache = Object.getOwnPropertyDescriptor(model, 'lastFoundTag');
  if (cache ? !('value' in cache) || !cache.writable : !Object.isExtensible(model)) return undefined;
  const start = startFrom === undefined ? model.getHeadRegardlessOfLane() : startFrom;
  const main = model.getHead();
  for (const ref of [start, main]) {
    if (ref && !hasRustSnapshotTransactionClassFields(ref, 'Ref', ['hash'])) return undefined;
  }
  const startHash = start ? Object.getOwnPropertyDescriptor(start, 'hash')?.value : null;
  const mainHead = main ? Object.getOwnPropertyDescriptor(main, 'hash')?.value : undefined;
  if ((startHash !== null && !hash(startHash)) || (mainHead !== undefined && !hash(mainHead))) return undefined;
  const result = await requestRustHistoryQuery<QueryResult>({
    kind: 'historyQueryBegin', objectsDirectory: capture.objectsDirectory,
    start: startHash, ...(mainHead === undefined ? {} : { mainHead }), throws: false,
    tags: capture.tags, orphaned: capture.orphaned, overlays: capture.overlays,
    ...(capture.lastFoundTag === undefined ? {} : { lastFoundTag: capture.lastFoundTag }),
  }, (data) => {
    if (!hash(data?.token) || !Array.isArray(data.rows) || data.rows.length > 4096 || typeof data.complete !== 'boolean')
      return false;
    if (data.lastFoundTag !== undefined && typeof data.lastFoundTag !== 'string') return false;
    return data.rows.every((row: any) => validRow(row) &&
      (row.missing || row.overlayIndex !== undefined || typeof row.versionJSON === 'string') &&
      (row.overlayIndex === undefined || (
      Number.isSafeInteger(row.overlayIndex) && row.overlayIndex >= 0 && row.overlayIndex < capture.versions.length &&
      capture.overlays[row.overlayIndex].hash === row.hash
    )));
  });
  if (!result || !retainRustHistoryQueryToken(result.token) || !capture.fresh()) return undefined;
  const hydration = prepareRustHistoryQueryHydration(repository, capture, result.rows);
  const loaded = hydration?.apply();
  if (!loaded) return undefined;
  const references = new Map<string, Ref>();
  if (start) references.set(startHash!, start);
  for (let index = 0; index < loaded.length; index++) {
    const version = loaded[index];
    if (!version) continue;
    for (let parent = 0; parent < version.parents.length; parent++) {
      const ref = version.parents[parent];
      if (!references.has(result.rows[index].parents[parent])) references.set(result.rows[index].parents[parent], ref);
    }
  }
  const rows = result.rows.map((row, index) => {
    const version = loaded[index];
    const ref = references.get(row.hash) || capture.refFor(row.hash) || Ref.from(row.hash);
    const parents = version ? version.parents : row.parents.map((parent) => capture.refFor(parent) || Ref.from(parent));
    const error = row.missing?.kind === 'head' ? new HeadNotFound(model.id(), row.hash) :
      row.missing?.kind === 'tag' ? new VersionNotFound(row.tag!, model.id()) :
      row.missing ? new ParentNotFound(model.id(), row.missing.parentOf!, row.hash) : undefined;
    return {
      ref, tag: row.tag, parents, onLane: row.onLane,
      ...(row.isPartOfHistory === undefined ? {} : { isPartOfHistory: row.isPartOfHistory }),
      ...(error ? { error } : { version: version || ({ log: row.log, hidden: row.hidden } as Version) }),
    };
  });
  if (result.lastFoundTag !== undefined) (model as any).lastFoundTag = result.lastFoundTag;
  rememberRustHistoryQueryLogToken(result.token);
  return rows;
}
