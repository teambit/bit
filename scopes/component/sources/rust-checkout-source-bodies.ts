import { createHash } from 'crypto';
import path from 'path';
import { types } from 'util';
import {
  type Repository,
  type Ref,
  type Source,
  type SourceFileModel,
  type CapturedSourceBody,
  hasRustSnapshotTransactionClassFieldsBatch,
  hasRustSnapshotFunctionReference,
  registerRustSnapshotFunctionReference,
} from '@teambit/objects';
import { checkoutSourceFrame } from './rust-checkout-source';
import { withWorkspaceSession } from './rust-workspace-persistence';

const MAX_BYTES = 32 * 1024 * 1024;
const queryModule = require('@teambit/objects/dist/objects/rust-history-query.js');
const sourceModule = require('@teambit/objects/dist/objects/rust-history-query-sources.js');
const repositoryGuard = Object.getOwnPropertyDescriptor(queryModule, 'canUseRustHistoryQueryRepository')?.value;
const sourceGuard = Object.getOwnPropertyDescriptor(sourceModule, 'canHydrateRustHistoryQuerySources')?.value;
const capture = Object.getOwnPropertyDescriptor(queryModule, 'captureRustHistoryQueryObjects')?.value;
const hydrate = Object.getOwnPropertyDescriptor(sourceModule, 'hydrateRustCapturedSourceBodies')?.value;
const contentsGuard = Object.getOwnPropertyDescriptor(sourceModule, 'hasRustCapturedSourceContents')?.value;
const cryptoModule = require('crypto');
const hash = createHash;
const from = Buffer.from;
const isBuffer = Buffer.isBuffer;
const subarray = Buffer.prototype.subarray;
const copy = Buffer.prototype.copy;
const hashPrototype = Object.getPrototypeOf(hash('sha1'));
const update = hashPrototype.update;
const digest = hashPrototype.digest;
type Manifest = {
  model: SourceFileModel;
  reference: Ref;
  hash: string;
  relativePath: string;
  name?: string;
  test?: boolean;
};
type Read = CapturedSourceBody | null;

function eligible(repository: Repository): boolean {
  return (
    hasRustSnapshotFunctionReference('HistoryQueryRepositoryEligibility', repositoryGuard) &&
    hasRustSnapshotFunctionReference('HistoryQuerySourceHydrationEligibility', sourceGuard) &&
    hasRustSnapshotFunctionReference('HistoryQueryObjectCapture', capture) &&
    Object.getOwnPropertyDescriptor(queryModule, 'canUseRustHistoryQueryRepository')?.value === repositoryGuard &&
    Object.getOwnPropertyDescriptor(queryModule, 'captureRustHistoryQueryObjects')?.value === capture &&
    Object.getOwnPropertyDescriptor(sourceModule, 'canHydrateRustHistoryQuerySources')?.value === sourceGuard &&
    repositoryGuard(repository) &&
    sourceGuard() &&
    hasRustSnapshotFunctionReference('HistoryQuerySourceBodyHydration', hydrate) &&
    Object.getOwnPropertyDescriptor(sourceModule, 'hydrateRustCapturedSourceBodies')?.value === hydrate &&
    Object.getOwnPropertyDescriptor(cryptoModule, 'createHash')?.value === hash &&
    Object.getOwnPropertyDescriptor(Buffer, 'from')?.value === from &&
    Object.getOwnPropertyDescriptor(Buffer, 'isBuffer')?.value === isBuffer &&
    Object.getOwnPropertyDescriptor(Buffer.prototype, 'subarray')?.value === subarray &&
    Object.getOwnPropertyDescriptor(Buffer.prototype, 'copy')?.value === copy &&
    Object.getOwnPropertyDescriptor(hashPrototype, 'update')?.value === update &&
    Object.getOwnPropertyDescriptor(hashPrototype, 'digest')?.value === digest
  );
}
function contentsMatch(source: Source, expected: string, body: Buffer): boolean {
  if (
    hasRustSnapshotFunctionReference('HistoryQuerySourceContents', contentsGuard) &&
    Object.getOwnPropertyDescriptor(sourceModule, 'hasRustCapturedSourceContents')?.value === contentsGuard &&
    contentsGuard(source, expected, body)
  )
    return true;
  return hash('sha1').update(body).digest('hex') === expected;
}

function cachedSources(repository: Repository, manifest: Manifest[]): Map<string, Source> | undefined {
  const entries = capture(
    repository,
    manifest.map((entry) => entry.hash)
  ) as Array<[string, object]> | undefined;
  if (
    !entries ||
    !hasRustSnapshotTransactionClassFieldsBatch(
      entries.map(([, source]) => source),
      'Source',
      ['contents']
    )
  )
    return undefined;
  const sources = new Map<string, Source>();
  for (const [key, source] of entries) {
    const body = Object.getOwnPropertyDescriptor(source, 'contents')?.value;
    if (
      !isBuffer(body) ||
      types.isProxy(body) ||
      Object.getPrototypeOf(body) !== Buffer.prototype ||
      ['copy', 'subarray', 'buffer', 'byteOffset', 'byteLength', 'length', 'valueOf', 'constructor'].some((name) =>
        Object.hasOwn(body, name)
      ) ||
      !contentsMatch(source as Source, key, body)
    )
      return undefined;
    sources.set(key, source as Source);
  }
  return sources;
}
function decode(
  data: unknown,
  body: Buffer | undefined,
  entries: Manifest[],
  cached: Map<string, Source>
): Read[] | undefined {
  if (!Array.isArray(data) || data.length !== entries.length || !body || body.length > MAX_BYTES) return undefined;
  let offset = 0;
  const records: Read[] = [];
  for (const [index, row] of data.entries()) {
    if (row === null) {
      if (!cached.has(entries[index].hash)) return undefined;
      records.push(null);
      continue;
    }
    if (
      !Array.isArray(row) ||
      row.length !== 4 ||
      !row.every((value) => Number.isSafeInteger(value) && value >= 0) ||
      row[0] !== offset ||
      row[1] > MAX_BYTES - offset ||
      row[2] <= 0 ||
      row[2] > MAX_BYTES ||
      row[3] < row[1] ||
      row[3] > row[1] + 256
    )
      return undefined;
    const contents = from(subarray.call(body, offset, offset + row[1]));
    offset += row[1];
    if (hash('sha1').update(contents).digest('hex') !== entries[index].hash) return undefined;
    records.push({ hash: entries[index].hash, body: contents, compressedSize: row[2], inflatedSize: row[3] });
  }
  return offset === body.length ? records : undefined;
}

/** Complete the logical asynchronous model loads at checkout preflight, including cache hydration. */
export async function readRustCheckoutSourceBodies(
  repository: Repository,
  objectsDirectory: string,
  manifest: Manifest[],
  fresh: () => boolean
): Promise<Source[] | undefined> {
  if (!eligible(repository)) return undefined;
  const cached = cachedSources(repository, manifest);
  if (!cached) return undefined;
  // Observe all canonical synchronous cache hits before starting any asynchronous read.
  const hits = manifest.map(
    (entry) =>
      Object.getOwnPropertyDescriptor(repository.objects, entry.hash)?.value || repository.getCache(entry.reference)
  );
  if (!hits.every((source, index) => source === cached.get(manifest[index].hash))) return undefined;
  // Canonical cache hits have already completed their logical reads. Only misses need I/O.
  const missing = manifest.filter((_, index) => !hits[index]);
  const records: CapturedSourceBody[] = [];
  let retainedBytes = 0;
  const loaded =
    !missing.length ||
    (await withWorkspaceSession(async (session) => {
      let width = 256;
      for (let offset = 0; offset < missing.length; ) {
        const batch = missing.slice(offset, offset + width);
        let result: Read[] | undefined;
        const completed = await session.request(
          (id) =>
            checkoutSourceFrame(
              'BWC2',
              id,
              objectsDirectory,
              batch.map((entry) => ({
                hash: entry.hash,
                preferCached: false,
                destination: path.resolve(objectsDirectory, entry.relativePath),
              }))
            ),
          batch.length,
          (response, body) => {
            if (response.failed) return true;
            if (!eligible(repository) || !fresh()) return false;
            result = decode(response.data, body, batch, cached);
            return Boolean(result);
          },
          MAX_BYTES + 65536,
          false,
          true
        );
        if (!fresh() || !eligible(repository)) return false;
        if (completed !== batch.length || !result) {
          if (width > 64 && completed === 0 && session.usable) {
            width = 64;
            continue;
          }
          return false;
        }
        retainedBytes += result.reduce((bytes, record) => bytes + (record?.body.length || 0), 0);
        if (retainedBytes > MAX_BYTES) return false;
        if (result.some((record) => record === null)) return false;
        records.push(...(result as CapturedSourceBody[]));
        offset += batch.length;
      }
      return true;
    }));
  if (!loaded || !fresh() || !eligible(repository)) return undefined;
  // Existing cache hits keep their actual instances; concurrent misses remain distinct Sources.
  if (
    !hasRustSnapshotTransactionClassFieldsBatch(hits.filter(Boolean), 'Source', ['contents']) ||
    hits.some((source, index) => source && !contentsMatch(source, manifest[index].hash, source.contents))
  )
    return undefined;
  if (records.length !== missing.length) return undefined;
  const sources = records.length ? (hydrate(repository, records) as Source[] | undefined) : [];
  if (!sources) return undefined;
  let cursor = 0;
  return hits.map((source) => source || sources[cursor++]);
}

registerRustSnapshotFunctionReference('CheckoutSourceBodyReader', readRustCheckoutSourceBodies);
