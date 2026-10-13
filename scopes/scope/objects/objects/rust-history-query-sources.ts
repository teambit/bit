import fs from 'fs-extra';
import { readRustBodyRange, canBatchRustBodyRangeReads } from './rust-body-range';
import path from 'path';
import { types } from 'util';
import type Repository from './repository';
import Source from '../models/source';
import BitObject from './object';
import Ref from './ref';
import {
  hasRustSnapshotTransactionClassConstructor,
  hasRustSnapshotTransactionClass,
  hasRustSnapshotTransactionClassFields,
  hasRustSnapshotTransactionClassFieldsBatch,
  hasRustSnapshotFunctions,
  registerRustSnapshotFunctionReference,
  hasRustSnapshotFunctionReference,
} from './rust-snapshot-guards';
import {
  canUseRustHistoryQueryRepository,
  captureRustHistoryQueryObjects,
  lookupRustHistoryQueryObject,
  isRustHistoryQueryOperation,
} from './rust-history-query';

export type HistorySourceCapsule = {
  hash: string;
  privatePath: string;
  compressedSize: number;
  inflatedSize: number;
  encoding?: 'raw';
  bodySize?: number;
  bodyOffset?: number;
};
export type HistorySourceReceipt = { sources: HistorySourceCapsule[]; sourceLoads: number[] };
const aliases = new WeakMap<object, { hash: string; contents: Buffer; snapshot: Buffer }>();
const equals = Buffer.prototype.equals;
const compareBytes = Buffer.compare;
const bodyRangeBatchGuard = canBatchRustBodyRangeReads;
const registrarModule = require.resolve('@teambit/legacy.scope/dist/object-registrar.js');

function sourceHydrationOwner(): boolean {
  if (isRustHistoryQueryOperation()) return true;
  const merge = require('./rust-merge-transaction');
  const active = Object.getOwnPropertyDescriptor(merge, 'isRustMergeTransactionOperation')?.value;
  return hasRustSnapshotFunctionReference('MergeTransactionOperationActive', active) && active();
}

export function canHydrateRustHistoryQuerySources(): boolean {
  const module = require('../models/source');
  const constructor = Object.getOwnPropertyDescriptor(module, 'default')?.value;
  const registrar = require(registrarModule);
  const registered = Object.getOwnPropertyDescriptor(registrar, 'typesObj')?.value;
  return (
    hasRustSnapshotTransactionClassConstructor('Source', constructor) &&
    hasRustSnapshotTransactionClassConstructor('Ref', Ref) &&
    Object.getOwnPropertyDescriptor(registered || {}, 'Source')?.value === constructor &&
    hasRustSnapshotFunctions(['HistoryQueryObjectParser', 'SnapshotRepositoryFS', 'SnapshotRepositoryPath'])
  );
}

registerRustSnapshotFunctionReference('HistoryQuerySourceHydrationEligibility', canHydrateRustHistoryQuerySources);

/** A private byte snapshot can validate an owned Source without hashing the same bytes again. */
export function hasRustCapturedSourceContents(source: Source, hash: string, body: Buffer): boolean {
  const alias = aliases.get(source);
  return Boolean(alias && alias.hash === hash && alias.contents === body && compareBytes(body, alias.snapshot) === 0);
}
registerRustSnapshotFunctionReference('HistoryQuerySourceContents', hasRustCapturedSourceContents);

/** Only Sources hydrated from this owned query may keep a repository descriptor after a cache mirror. */
export function hasRustHistoryQuerySourceAlias(repository: Repository, hash: string): boolean {
  if (!canUseRustHistoryQueryRepository(repository) || !canHydrateRustHistoryQuerySources()) return false;
  const source = lookupRustHistoryQueryObject(repository, hash)?.value;
  if (!source || types.isProxy(source)) return false;
  const alias = aliases.get(source);
  const contents = Object.getOwnPropertyDescriptor(source, 'contents')?.value;
  return Boolean(
    alias &&
      alias.hash === hash &&
      contents === alias.contents &&
      hasRustSnapshotTransactionClassFields(source, 'Source', ['contents']) &&
      Buffer.isBuffer(contents) &&
      Object.getPrototypeOf(contents) === Buffer.prototype &&
      equals.call(contents, alias.snapshot)
  );
}
registerRustSnapshotFunctionReference('HistoryQuerySourceAlias', hasRustHistoryQuerySourceAlias);

export function validRustHistorySourceReceipt(data: any, directory: string): boolean {
  if (
    !Array.isArray(data?.sources) ||
    data.sources.length > 4096 ||
    !Array.isArray(data.sourceLoads) ||
    data.sourceLoads.length > 16384
  )
    return false;
  for (let index = 0; index < data.sources.length; index++) {
    const source = data.sources[index];
    if (
      !source ||
      typeof source.hash !== 'string' ||
      !/^[a-f0-9]{40}$/.test(source.hash) ||
      typeof source.privatePath !== 'string' ||
      path.dirname(source.privatePath) !== directory ||
      !Number.isSafeInteger(source.compressedSize) ||
      source.compressedSize < 0 ||
      source.compressedSize > 32 * 1024 * 1024 ||
      !Number.isSafeInteger(source.inflatedSize) ||
      source.inflatedSize < 0 ||
      source.inflatedSize > 32 * 1024 * 1024 ||
      (source.encoding !== undefined && source.encoding !== 'raw') ||
      (source.bodyOffset !== undefined &&
        (source.encoding !== 'raw' ||
          !Number.isSafeInteger(source.bodyOffset) ||
          source.bodyOffset < 0 ||
          source.bodyOffset + source.bodySize > 32 * 1024 * 1024)) ||
      (source.encoding === 'raw' &&
        (!Number.isSafeInteger(source.bodySize) || source.bodySize < 0 || source.bodySize > source.inflatedSize))
    )
      return false;
  }
  for (let index = 0; index < data.sourceLoads.length; index++) {
    const source = data.sourceLoads[index];
    if (!Number.isSafeInteger(source) || source < 0 || source >= data.sources.length) return false;
  }
  return true;
}

/** One logical canonical Source load, preserving synchronous cache checks and concurrent miss aliases. */
export async function loadRustCapturedSourceCapsule(
  repository: Repository,
  descriptor: HistorySourceCapsule,
  reference?: Ref
): Promise<Source | undefined> {
  if (!sourceHydrationOwner() || !canUseRustHistoryQueryRepository(repository) || !canHydrateRustHistoryQuerySources())
    return undefined;
  reference ||= Ref.from(descriptor.hash);
  if (
    !hasRustSnapshotTransactionClassFields(reference, 'Ref', ['hash']) ||
    Object.getOwnPropertyDescriptor(reference, 'hash')?.value !== descriptor.hash
  )
    return undefined;
  return loadCapturedSource(repository, descriptor, reference);
}

/** Start a synchronous group of canonical cache checks with shared defining-class guards. */
export function loadRustCapturedSourceCapsuleBatch(
  repository: Repository,
  requests: Array<{ descriptor: HistorySourceCapsule; reference: Ref }>
): Array<Promise<Source | undefined>> | undefined {
  if (
    !hasRustSnapshotTransactionClass(requests, 'Array') ||
    requests.length > 16384 ||
    canBatchRustBodyRangeReads !== bodyRangeBatchGuard ||
    !bodyRangeBatchGuard() ||
    !requests.every(
      (request) =>
        ordinaryBatchRecord(request) &&
        Object.hasOwn(request, 'descriptor') &&
        Object.hasOwn(request, 'reference') &&
        ordinaryBatchRecord(request.descriptor) &&
        ['hash', 'bodyOffset', 'privatePath', 'bodySize'].every((key) => Object.hasOwn(request.descriptor, key))
    ) ||
    !sourceHydrationOwner() ||
    !canUseRustHistoryQueryRepository(repository) ||
    !canHydrateRustHistoryQuerySources() ||
    !hasRustSnapshotTransactionClassFieldsBatch(
      requests.map((request) => request.reference),
      'Ref',
      ['hash']
    ) ||
    requests.some(
      ({ descriptor, reference }) => Object.getOwnPropertyDescriptor(reference, 'hash')?.value !== descriptor.hash
    )
  )
    return undefined;
  const cached = captureRustHistoryQueryObjects(
    repository,
    requests.map(({ descriptor }) => descriptor.hash)
  );
  if (
    !cached ||
    Object.getOwnPropertyDescriptor(Object.prototype, 'then') ||
    !hasRustSnapshotTransactionClassFieldsBatch(
      cached.map(([, value]) => value),
      'Source',
      []
    ) ||
    cached.some(([, value]) => Object.hasOwn(value, 'then'))
  )
    return undefined;
  // These guarded synchronous cache reads invoke no user callbacks. Every read's
  // asynchronous continuation still rechecks the live repository and constructors.
  return requests.map(({ descriptor, reference }) => loadCapturedSource(repository, descriptor, reference));
}

function ordinaryBatchRecord(value: unknown): value is Record<string, any> {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype)
    return false;
  return Reflect.ownKeys(value).every((key) => 'value' in Object.getOwnPropertyDescriptor(value, key)!);
}

async function loadCapturedSource(
  repository: Repository,
  descriptor: HistorySourceCapsule,
  reference: Ref
): Promise<Source | undefined> {
  const pending = Object.getOwnPropertyDescriptor(repository.objects, descriptor.hash)?.value;
  const cached = pending || repository.getCache(reference);
  if (cached) return cached as Source;
  const compressed =
    descriptor.bodyOffset === undefined
      ? await fs.readFile(descriptor.privatePath)
      : await readRustBodyRange(descriptor.privatePath, descriptor.bodyOffset, descriptor.bodySize!);
  if (!sourceHydrationOwner() || !canHydrateRustHistoryQuerySources() || !canUseRustHistoryQueryRepository(repository))
    return undefined;
  if (compressed.length !== (descriptor.encoding === 'raw' ? descriptor.bodySize : descriptor.compressedSize))
    throw new Error('history query Source capsule size changed');
  // Merge preparation already parsed and verified these bytes. Keep the defining Source
  // constructor and repository size accounting without inflating the same object twice.
  const parsed =
    descriptor.encoding === 'raw'
      ? { object: Source.parse(compressed), inflatedSize: descriptor.inflatedSize }
      : await BitObject.parseObjectWithSize(compressed, descriptor.privatePath);
  // Raw Source.parse is synchronous and its defining class was verified immediately above.
  // Compressed parsing awaits user-visible asynchronous work, so it needs a new boundary check.
  if (
    descriptor.encoding !== 'raw' &&
    (!sourceHydrationOwner() || !canHydrateRustHistoryQuerySources() || !canUseRustHistoryQueryRepository(repository))
  )
    return undefined;
  if (
    parsed.inflatedSize !== descriptor.inflatedSize ||
    (descriptor.encoding !== 'raw' && !hasRustSnapshotTransactionClassFields(parsed.object, 'Source', ['contents']))
  )
    throw new Error('history query Source capsule metadata changed');
  const source = parsed.object as Source;
  const contents = Object.getOwnPropertyDescriptor(source, 'contents')?.value;
  if (!Buffer.isBuffer(contents) || source.hash().toString() !== descriptor.hash)
    throw new Error('history query Source capsule identity changed');
  aliases.set(source, { hash: descriptor.hash, contents, snapshot: Buffer.from(contents) });
  repository.hydrateHistoryQueryVersion(source, descriptor.inflatedSize, descriptor.compressedSize);
  return source;
}

/** Read exact private compressed receipts, never re-read a repository file after the owned body decisions. */
export async function hydrateRustHistoryQuerySources(
  repository: Repository,
  receipt: HistorySourceReceipt
): Promise<boolean> {
  if (!sourceHydrationOwner() || !canUseRustHistoryQueryRepository(repository) || !canHydrateRustHistoryQuerySources())
    return false;
  for (let index = 0; index < receipt.sourceLoads.length; index++) {
    const descriptor = receipt.sources[receipt.sourceLoads[index]];
    if (!(await loadRustCapturedSourceCapsule(repository, descriptor))) return false;
  }
  return true;
}

export type CapturedSourceBody = { hash: string; body: Buffer; inflatedSize: number; compressedSize: number };
/** Hydrate one completed parallel read group with the canonical asynchronous load cache policy. */
export function hydrateRustCapturedSourceBodies(
  repository: Repository,
  records: CapturedSourceBody[]
): Source[] | undefined {
  if (!sourceHydrationOwner() || !canUseRustHistoryQueryRepository(repository) || !canHydrateRustHistoryQuerySources())
    return undefined;
  if (
    records.length > 4096 ||
    records.some(
      (record) =>
        !Buffer.isBuffer(record.body) ||
        !/^[a-f0-9]{40}$/.test(record.hash) ||
        !Number.isSafeInteger(record.inflatedSize) ||
        record.inflatedSize < record.body.length ||
        record.inflatedSize > record.body.length + 256 ||
        !Number.isSafeInteger(record.compressedSize) ||
        record.compressedSize <= 0 ||
        record.compressedSize > 32 * 1024 * 1024
    )
  )
    return undefined;
  const sources = records.map((record) => Source.parse(record.body));
  if (
    !hasRustSnapshotTransactionClassFieldsBatch(sources, 'Source', ['contents']) ||
    sources.some((source, index) => source.hash().toString() !== records[index].hash)
  )
    return undefined;
  for (const [index, source] of sources.entries()) {
    const record = records[index];
    aliases.set(source, { hash: record.hash, contents: source.contents, snapshot: Buffer.from(source.contents) });
    repository.hydrateHistoryQueryVersion(source, record.inflatedSize, record.compressedSize);
  }
  return sources;
}
registerRustSnapshotFunctionReference('HistoryQuerySourceBodyHydration', hydrateRustCapturedSourceBodies);
