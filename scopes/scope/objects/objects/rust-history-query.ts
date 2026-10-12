import { AsyncLocalStorage } from 'async_hooks';
import { types } from 'util';
import type * as Sources from '@teambit/component.sources';
import type Repository from './repository';
import { canReadCacheNatively, captureRustCacheEntries, lookupRustCacheEntry } from '@teambit/harmony.modules.in-memory-cache';
import { canReadLiveObjectsNatively, captureRustLiveObjects, lookupRustLiveObject } from './live-objects';
import { hasRustSnapshotTransactionClassFields, hasRustSnapshotFunctions, registerRustSnapshotFunctionReference } from './rust-snapshot-guards';
import type Version from '../models/version';
import type ModelComponent from '../models/model-component';
import type Ref from './ref';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

type Session = Parameters<Parameters<typeof Sources.withWorkspaceSession>[0]>[0];
type Owner = {
  session?: Session;
  closed: boolean;
  pending: Promise<void>;
  cleanups: Array<() => Promise<void>>;
  logToken?: string;
  sourceDirectory?: Promise<string | undefined>;
};
const owners = new AsyncLocalStorage<Owner>();
const stringify = JSON.stringify;
const maximumBytes = 4 * 1024 * 1024;
function hasDefaultSerialization(): boolean {
  return Object.getOwnPropertyDescriptor(JSON, 'stringify')?.value === stringify &&
    !Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON') &&
    !Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON');
}
// eslint-disable-next-line no-var
var repositoryDefaults: { constructor: any; prototype: PropertyDescriptorMap; statics: PropertyDescriptorMap; hooksRegistered?: boolean } | undefined;

export function registerRustHistoryQueryRepository(constructor: any): void {
  repositoryDefaults ||= {
    constructor,
    prototype: Object.getOwnPropertyDescriptors(constructor.prototype),
    statics: Object.getOwnPropertyDescriptors(constructor),
  };
}

/** ScopeMain installs these default slot closures after the Repository defining module has loaded. */
export function registerRustHistoryQueryRepositoryHooks(constructor: any): void {
  const defaults = repositoryDefaults;
  if (!defaults || defaults.constructor !== constructor || defaults.hooksRegistered) return;
  const names = ['onPostObjectsPersist', 'onPreObjectPersist', 'hasPreObjectPersistTransformer',
    'onPostObjectRead', 'hasPostObjectReadTransformer'];
  const fields = Object.getOwnPropertyDescriptors(constructor);
  if (names.some((name) => !fields[name] || !('value' in fields[name]) || typeof fields[name].value !== 'function')) return;
  for (const name of names) defaults.statics[name] = fields[name];
  defaults.hooksRegistered = true;
}

function sameDescriptors(owner: object, expected: PropertyDescriptorMap): boolean {
  const keys = Reflect.ownKeys(expected);
  if (Reflect.ownKeys(owner).length !== keys.length) return false;
  for (const key of keys) {
    const before = Reflect.get(expected, key) as PropertyDescriptor;
    const after = Object.getOwnPropertyDescriptor(owner, key);
    if (
      !after || ('value' in before) !== ('value' in after) ||
      before.value !== after.value || before.get !== after.get || before.set !== after.set ||
      before.writable !== after.writable || before.enumerable !== after.enumerable ||
      before.configurable !== after.configurable
    ) return false;
  }
  return true;
}

/** Cached Versions are captured by the query projection; this guard only establishes safe cache access. */
export function canUseRustHistoryQueryRepository(repository: Repository): boolean {
  const defaults = repositoryDefaults;
  if (
    !defaults || !hasRustSnapshotFunctions(['SnapshotRepositoryPath']) || types.isProxy(repository) ||
    Object.getPrototypeOf(repository) !== defaults.constructor.prototype ||
    !sameDescriptors(defaults.constructor.prototype, defaults.prototype) ||
    !sameDescriptors(defaults.constructor, defaults.statics)
  ) return false;
  const fields = Object.getOwnPropertyDescriptors(repository);
  for (const key of Reflect.ownKeys(fields)) {
    const field = Reflect.get(fields, key) as PropertyDescriptor;
    if (!('value' in field) || Reflect.has(defaults.prototype, key)) return false;
  }
  return Boolean(
    fields.onRead && fields.defaultOnRead && fields.onRead.value === fields.defaultOnRead.value &&
    fields.scopePath && typeof fields.scopePath.value === 'string' &&
    defaults.prototype.canReadNatively.value.call(repository) &&
    fields.cache && canReadCacheNatively(fields.cache.value) &&
    fields.liveObjects && canReadLiveObjectsNatively(fields.liveObjects.value) &&
    fields.objects && ordinaryObjectMap(fields.objects.value)
  );
}

function ordinaryObjectMap(value: unknown): boolean {
  if (!value || typeof value !== 'object' || types.isProxy(value)) return false;
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const fields = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(fields).length <= 4096 && Reflect.ownKeys(fields).every((key) => {
    const descriptor = Reflect.get(fields, key) as PropertyDescriptor;
    return typeof key === 'string' && 'value' in descriptor && descriptor.enumerable;
  });
}

/** Pending objects precede strong cache entries, which precede surviving weak aliases. */
export function captureRustHistoryQueryObjects(repository: Repository): Array<[string, object]> | undefined {
  if (!canUseRustHistoryQueryRepository(repository)) return undefined;
  const fields = Object.getOwnPropertyDescriptors(repository);
  const strong = captureRustCacheEntries(fields.cache.value);
  const weak = captureRustLiveObjects(fields.liveObjects.value);
  if (!strong || !weak) return undefined;
  const result: Array<[string, object]> = [];
  const seen = new Set<string>();
  const pending = Object.getOwnPropertyDescriptors(fields.objects.value);
  for (const key of Reflect.ownKeys(pending)) {
    if (typeof key !== 'string') return undefined;
    const value = Reflect.get(pending, key).value;
    if (!value) continue;
    if (typeof value !== 'object') return undefined;
    result[result.length] = [key, value];
    seen.add(key);
  }
  const lists = [strong, weak];
  for (let listIndex = 0; listIndex < lists.length; listIndex++) {
    const list = lists[listIndex];
    for (let index = 0; index < list.length; index++) {
      const key = list[index][0];
      const value = list[index][1];
      if (seen.has(key)) continue;
      seen.add(key);
      result[result.length] = [key, value];
    }
  }
  return result.length <= 4096 ? result : undefined;
}
registerRustSnapshotFunctionReference('HistoryQueryObjectCapture', captureRustHistoryQueryObjects);

/** Single-Source guards retain pending/strong/weak precedence without scanning every alias. */
export function lookupRustHistoryQueryObject(repository: Repository, hash: string): { value?: object } | undefined {
  if (!canUseRustHistoryQueryRepository(repository)) return undefined;
  const fields = Object.getOwnPropertyDescriptors(repository);
  const pending = Object.getOwnPropertyDescriptor(fields.objects.value, hash)?.value;
  if (pending) return typeof pending === 'object' ? { value: pending } : undefined;
  const strong = lookupRustCacheEntry(fields.cache.value, hash);
  if (!strong || strong.value) return strong;
  return lookupRustLiveObject(fields.liveObjects.value, hash);
}
registerRustSnapshotFunctionReference('HistoryQueryObjectLookup', lookupRustHistoryQueryObject);

export type HistoryQueryOverlay = {
  hash: string;
  parents: string[];
  log: Record<string, unknown>;
  hidden?: boolean;
  unrelated?: string;
  squashed?: string[];
  files?: Array<{ file: string; relativePath: string; name?: string; test?: boolean }>;
};
type LabelRef = { label: string; hash: string };
const otherQueryObjects = ['ModelComponent', 'Source', 'Lane', 'VersionHistory', 'LaneHistory', 'ScopeMeta'];

function isOtherQueryObject(value: object): boolean {
  for (let index = 0; index < otherQueryObjects.length; index++)
    if (hasRustSnapshotTransactionClassFields(value, otherQueryObjects[index], [])) return true;
  return false;
}

function labelRefs(value: unknown): LabelRef[] | undefined {
  if (!ordinaryObjectMap(value)) return undefined;
  const fields = Object.getOwnPropertyDescriptors(value);
  const result: LabelRef[] = [];
  const keys = Reflect.ownKeys(fields);
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    if (typeof key !== 'string') return undefined;
    const hash = refHash(Reflect.get(fields, key).value);
    if (!hash) return undefined;
    result[index] = { label: key, hash };
  }
  return result;
}

export type HistoryQueryCapture = {
  objectsDirectory: string;
  overlays: HistoryQueryOverlay[];
  versions: Version[];
  objects: Array<[string, object]>;
  tags: LabelRef[];
  orphaned: LabelRef[];
  lastFoundTag?: string;
  fresh: () => boolean;
  refFor: (hash: string) => Ref | undefined;
};

function captureAliasDescriptors(roots: object[]): Array<{ owner: object; fields: PropertyDescriptorMap }> | undefined {
  const result: Array<{ owner: object; fields: PropertyDescriptorMap }> = [];
  const seen = new Set<object>();
  const pending: object[] = [];
  for (let index = 0; index < roots.length; index++) pending[index] = roots[index];
  for (let index = 0; index < pending.length; index++) {
    const owner = pending[index];
    if (seen.has(owner)) continue;
    if (types.isProxy(owner) || pending.length > 16384) return undefined;
    seen.add(owner);
    const fields = Object.getOwnPropertyDescriptors(owner);
    result[result.length] = { owner, fields };
    const keys = Reflect.ownKeys(fields);
    for (let field = 0; field < keys.length; field++) {
      const descriptor = Reflect.get(fields, keys[field]) as PropertyDescriptor;
      if (!('value' in descriptor)) return undefined;
      const value = descriptor.value;
      if (!value || typeof value !== 'object') continue;
      if (types.isProxy(value)) return undefined;
      const prototype = Object.getPrototypeOf(value);
      if (Array.isArray(value) || prototype === Object.prototype || prototype === null || refHash(value))
        pending[pending.length] = value;
    }
  }
  return result;
}

/** Capture live metadata authority without running Version serialization or model hooks. */
export function captureRustHistoryQuery(
  repository: Repository,
  model: ModelComponent
): HistoryQueryCapture | undefined {
  if (!isRustHistoryQueryOperation() || !hasDefaultSerialization() || !canUseRustHistoryQueryRepository(repository)) return undefined;
  if (types.isProxy(model) || !hasRustSnapshotTransactionClassFields(model, 'ModelComponent', ['versions', 'orphanedVersions', 'lastFoundTag', 'head', 'laneHeadLocal']))
    return undefined;
  const fields = Object.getOwnPropertyDescriptors(model);
  const tags = labelRefs(fields.versions?.value);
  const orphaned = labelRefs(fields.orphanedVersions?.value);
  const lastFoundTag = fields.lastFoundTag?.value;
  if (!tags || !orphaned || (lastFoundTag !== undefined && typeof lastFoundTag !== 'string')) return undefined;
  const objects = captureRustHistoryQueryObjects(repository);
  if (!objects) return undefined;
  const overlays: HistoryQueryOverlay[] = [];
  const versions: Version[] = [];
  const refs = new Map<string, Ref>();
  for (let index = 0; index < objects.length; index++) {
    const object = objects[index][1];
    if (!hasRustSnapshotTransactionClassFields(object, 'Version', ['_hash', 'parents', 'log', 'hidden'])) {
      if (!isOtherQueryObject(object)) return undefined;
      continue;
    }
    const overlay = captureRustHistoryQueryVersion(object as Version);
    if (!overlay || overlay.hash !== objects[index][0]) return undefined;
    overlays[overlays.length] = overlay;
    versions[versions.length] = object as Version;
    const parents = Object.getOwnPropertyDescriptor(object, 'parents')!.value as Ref[];
    for (let parent = 0; parent < parents.length; parent++) if (!refs.has(overlay.parents[parent])) refs.set(overlay.parents[parent], parents[parent]);
  }
  const objectsDirectory = repository.getPath();
  const aliasRoots: object[] = [fields.versions.value as object, fields.orphanedVersions.value as object];
  if (!hasRustSnapshotTransactionClassFields(aliasRoots, 'Array', [])) return undefined;
  const versionDescriptors = versions.map((version) => Object.getOwnPropertyDescriptors(version));
  for (const name of ['head', 'laneHeadLocal']) {
    const value = fields[name]?.value;
    if (value) {
      if (!refHash(value)) return undefined;
      aliasRoots[aliasRoots.length] = value;
    }
  }
  for (let index = 0; index < versions.length; index++) {
    const versionFields = Object.getOwnPropertyDescriptors(versions[index]);
    for (const name of ['parents', 'log', 'unrelated', 'squashed']) {
      const value = versionFields[name]?.value;
      if (value) aliasRoots[aliasRoots.length] = value;
    }
  }
  const aliases = captureAliasDescriptors(aliasRoots);
  if (!aliases) return undefined;
  const signature = stringify({ overlays, tags, orphaned, lastFoundTag });
  return {
    objectsDirectory, overlays, versions, objects, tags, orphaned,
    ...(lastFoundTag === undefined ? {} : { lastFoundTag }),
    refFor: (hash) => refs.get(hash),
    fresh: () => {
      if (!hasDefaultSerialization()) return false;
      if (!hasRustSnapshotTransactionClassFields(model, 'ModelComponent', ['versions', 'orphanedVersions', 'lastFoundTag', 'head', 'laneHeadLocal'])) return false;
      if (!canUseRustHistoryQueryRepository(repository) || repository.getPath() !== objectsDirectory) return false;
      const current = captureRustHistoryQueryObjects(repository);
      if (!current || current.length !== objects.length) return false;
      for (let index = 0; index < current.length; index++)
        if (current[index][0] !== objects[index][0] || current[index][1] !== objects[index][1]) return false;
      const liveFields = Object.getOwnPropertyDescriptors(model);
      for (const name of ['head', 'laneHeadLocal'])
        if (liveFields[name]?.value !== fields[name]?.value) return false;
      for (let index = 0; index < aliases.length; index++)
        if (!sameDescriptors(aliases[index].owner, aliases[index].fields)) return false;
      const oldCache = fields.lastFoundTag;
      const newCache = liveFields.lastFoundTag;
      if (oldCache ? !newCache || !Reflect.ownKeys(oldCache).every((key) => Reflect.get(oldCache, key) === Reflect.get(newCache, key)) : newCache) return false;
      if (liveFields.versions?.value !== fields.versions?.value || liveFields.orphanedVersions?.value !== fields.orphanedVersions?.value) return false;
      const liveOverlays: HistoryQueryOverlay[] = [];
      for (let index = 0; index < versions.length; index++) {
        const currentFields = Object.getOwnPropertyDescriptors(versions[index]);
        for (const name of ['_hash', 'parents', 'log', 'hidden', 'unrelated', 'squashed']) {
          const before = versionDescriptors[index][name];
          const after = currentFields[name];
          if (before ? !after || !Reflect.ownKeys(before).every((key) => Reflect.get(before, key) === Reflect.get(after, key)) : after) return false;
        }
        const overlay = captureRustHistoryQueryVersion(versions[index]);
        if (!overlay) return false;
        liveOverlays[index] = overlay;
      }
      return signature === stringify({ overlays: liveOverlays, tags: labelRefs(liveFields.versions?.value), orphaned: labelRefs(liveFields.orphanedVersions?.value), lastFoundTag: liveFields.lastFoundTag?.value });
    },
  };
}

function refHash(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || types.isProxy(value)) return undefined;
  if (!hasRustSnapshotTransactionClassFields(value, 'Ref', ['hash'])) return undefined;
  const hash = Object.getOwnPropertyDescriptor(value, 'hash')?.value;
  return typeof hash === 'string' && /^[a-f0-9]{40}$/.test(hash) ? hash : undefined;
}

function refHashes(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || types.isProxy(value) || value.length > 4096) return undefined;
  if (!hasRustSnapshotTransactionClassFields(value, 'Array', [])) return undefined;
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).length !== value.length + 1) return undefined;
  const result: string[] = [];
  for (let index = 0; index < value.length; index++) {
    const field = fields[index];
    if (!field || !('value' in field)) return undefined;
    const hash = refHash(field.value);
    if (!hash) return undefined;
    result[index] = hash;
  }
  return result;
}

/** Capture only fields read by log traversal; model hooks and unrelated Version fields are untouched. */
export function captureRustHistoryQueryVersion(version: Version): HistoryQueryOverlay | undefined {
  if (types.isProxy(version) || !hasRustSnapshotTransactionClassFields(version, 'Version', ['_hash', 'parents', 'log', 'hidden', 'unrelated', 'squashed', 'files']))
    return undefined;
  const fields = Object.getOwnPropertyDescriptors(version);
  const hash = fields._hash?.value;
  const parents = refHashes(fields.parents?.value);
  const log = fields.log?.value;
  const hidden = fields.hidden?.value;
  const unrelatedValue = fields.unrelated?.value;
  const squashedValue = fields.squashed?.value;
  if ((unrelatedValue && !ordinaryObjectMap(unrelatedValue)) || (squashedValue && !ordinaryObjectMap(squashedValue)))
    return undefined;
  const unrelated = unrelatedValue ? refHash(Object.getOwnPropertyDescriptor(unrelatedValue, 'head')?.value) : undefined;
  const squashed = squashedValue ? refHashes(Object.getOwnPropertyDescriptor(squashedValue, 'previousParents')?.value) : undefined;
  if (
    typeof hash !== 'string' || !/^[a-f0-9]{40}$/.test(hash) || !parents || !ordinaryObjectMap(log) ||
    (hidden !== undefined && typeof hidden !== 'boolean') ||
    (unrelatedValue && (!ordinaryObjectMap(unrelatedValue) || !unrelated)) ||
    (squashedValue && (!ordinaryObjectMap(squashedValue) || !squashed))
  ) return undefined;
  const capturedLog: Record<string, unknown> = Object.create(null);
  const logFields = Object.getOwnPropertyDescriptors(log);
  for (const key of Reflect.ownKeys(logFields)) {
    if (typeof key !== 'string') return undefined;
    if (!['message', 'date', 'username', 'email'].includes(key)) continue;
    const value = Reflect.get(logFields, key).value;
    if (value === undefined) continue;
    if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) return undefined;
    if (typeof value === 'number' && !Number.isFinite(value)) return undefined;
    Object.defineProperty(capturedLog, key, { value, writable: true, enumerable: true, configurable: true });
  }
  return {
    hash, parents, log: capturedLog,
    ...(hidden === undefined ? {} : { hidden }),
    ...(unrelated === undefined ? {} : { unrelated }),
    ...(squashed === undefined ? {} : { squashed }),
  };
}

export function captureRustHistoryQueryVersionGuard(
  version: Version
): { metadata: HistoryQueryOverlay; fresh: () => boolean } | undefined {
  if (!hasDefaultSerialization()) return undefined;
  const metadata = captureRustHistoryQueryVersion(version);
  if (!metadata) return undefined;
  const fields = Object.getOwnPropertyDescriptors(version);
  const names = ['_hash', 'parents', 'log', 'hidden', 'unrelated', 'squashed'];
  const roots: object[] = [];
  for (let index = 0; index < names.length; index++) {
    const value = fields[names[index]]?.value;
    if (value && typeof value === 'object') roots[roots.length] = value;
  }
  const aliases = captureAliasDescriptors(roots);
  if (!aliases) return undefined;
  const signature = stringify(metadata);
  return {
    metadata,
    fresh: () => {
      if (!hasDefaultSerialization()) return false;
      const currentMetadata = captureRustHistoryQueryVersion(version);
      if (!currentMetadata || stringify(currentMetadata) !== signature) return false;
      const current = Object.getOwnPropertyDescriptors(version);
      for (let index = 0; index < names.length; index++) {
        const before = fields[names[index]];
        const after = current[names[index]];
        if (before ? !after || !Reflect.ownKeys(before).every((key) => Reflect.get(before, key) === Reflect.get(after, key)) : after)
          return false;
      }
      for (let index = 0; index < aliases.length; index++)
        if (!sameDescriptors(aliases[index].owner, aliases[index].fields)) return false;
      return true;
    },
  };
}

function ordinaryInput(value: unknown, depth = 0, seen = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || depth > 64 || types.isProxy(value) || seen.has(value)) return false;
  const array = Array.isArray(value);
  const length = array ? (value as unknown[]).length : 0;
  const prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length > 16385 || keys.some((key) => typeof key !== 'string')) return false;
  if (array && keys.length !== length + 1) return false;
  seen.add(value);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) return false;
    if (array && key === 'length') continue;
    if (array && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length))
      return false;
    if (!descriptor.enumerable || !ordinaryInput(descriptor.value, depth + 1, seen)) return false;
  }
  seen.delete(value);
  return true;
}

export function isRustHistoryQueryOperation(): boolean {
  const owner = owners.getStore();
  return process.env.BIT_RUST_CLIENT_VCS === 'on' && Boolean(owner?.session?.usable && !owner.closed);
}
registerRustSnapshotFunctionReference('HistoryQueryOperationActive', isRustHistoryQueryOperation);

export function registerRustHistoryQueryCleanup(cleanup: () => Promise<void>): boolean {
  const owner = owners.getStore();
  if (!owner || owner.closed) return false;
  owner.cleanups.push(cleanup);
  return true;
}

export function rememberRustHistoryQueryLogToken(token: string | undefined): void {
  const owner = owners.getStore();
  if (owner && isRustHistoryQueryOperation()) owner.logToken = token;
}

export function getRustHistoryQueryLogToken(): string | undefined {
  return isRustHistoryQueryOperation() ? owners.getStore()?.logToken : undefined;
}

export function getRustHistoryQuerySourceDirectory(): Promise<string | undefined> {
  const owner = owners.getStore();
  if (!owner || !isRustHistoryQueryOperation() || !hasRustSnapshotFunctions(['SnapshotRepositoryFS', 'SnapshotRepositoryPath']))
    return Promise.resolve(undefined);
  if (!owner.sourceDirectory) {
    const remove = Object.getOwnPropertyDescriptor(fs, 'remove')!.value as typeof fs.remove;
    owner.sourceDirectory = fs.mkdtemp(path.join(os.tmpdir(), 'bit-history-query-sources-')).catch(() => undefined);
    owner.cleanups[owner.cleanups.length] = async () => {
      const directory = await owner.sourceDirectory;
      if (directory) await remove.call(fs, directory);
    };
  }
  return owner.sourceDirectory;
}

/** Capture cleanup authority now; public requests remain blocked once the operation starts closing. */
export function retainRustHistoryQueryToken(token: string): boolean {
  const owner = owners.getStore();
  if (!owner || !isRustHistoryQueryOperation() || !/^[a-f0-9]{40}$/.test(token) || !hasDefaultSerialization())
    return false;
  const bytes = Buffer.from(stringify({ kind: 'historyQueryFinish', token }));
  owner.cleanups[owner.cleanups.length] = async () => {
    if (!owner.session?.usable) return;
    let finished = false;
    await owner.session.request(
      (id) => {
        const header = Buffer.alloc(12);
        header.write('BMT1');
        header.writeUInt32BE(id, 4);
        header.writeUInt32BE(bytes.length, 8);
        return Buffer.concat([header, bytes]);
      },
      1,
      (response) => {
        if (response.failed) return response.completed === 0 && response.data === undefined;
        finished = response.completed === 1 && (response.data as { finished?: boolean } | undefined)?.finished === true;
        return finished;
      },
      maximumBytes
    );
    if (!finished) await owner.session.dispose();
  };
  return true;
}

/** The broker owns one physical helper; nested public callbacks borrow it without taking a second lease. */
export function withRustHistoryQueryOperation<T>(action: () => Promise<T>): Promise<T> {
  if (process.env.BIT_RUST_CLIENT_VCS !== 'on' || owners.getStore()) return action();
  const sources = require('@teambit/component.sources') as typeof Sources;
  return sources.withWorkspacePersistence(() =>
    sources.withRustWorkspaceEngine(async () => {
      const owner: Owner = { closed: false, pending: Promise.resolve(), cleanups: [] };
      let entered = false;
      const run = () => owners.run(owner, () => sources.withRustSourceReads(action));
      const result = await sources.withWorkspaceSession(async (session) => {
        entered = true;
        owner.session = session;
        try {
          return await run();
        } finally {
          owner.closed = true;
          await owner.pending;
          for (let index = owner.cleanups.length - 1; index >= 0; index--)
            await owner.cleanups[index]().catch(() => undefined);
        }
      });
      return entered ? (result as T) : run();
    })
  );
}

export async function retireRustHistoryQueryOperation(): Promise<void> {
  const owner = owners.getStore();
  if (!owner) return;
  owner.closed = true;
  await owner.pending;
  await owner.session?.dispose();
}

/** Only primitive, descriptor-checked metadata crosses this boundary, never a Source body. */
export function requestRustHistoryQuery<T>(input: object, validate: (data: any) => boolean): Promise<T | undefined> {
  const owner = owners.getStore();
  if (!owner || !isRustHistoryQueryOperation()) return Promise.resolve(undefined);
  if (
    !hasDefaultSerialization() ||
    !ordinaryInput(input)
  )
    return Promise.resolve(undefined);
  const bytes = Buffer.from(stringify(input));
  if (!bytes.length || bytes.length > maximumBytes) return Promise.resolve(undefined);
  const request = owner.pending.then(async () => {
    if (!isRustHistoryQueryOperation() || !owner.session) return undefined;
    let result: T | undefined;
    await owner.session.request(
      (id) => {
        const header = Buffer.alloc(12);
        header.write('BMT1');
        header.writeUInt32BE(id, 4);
        header.writeUInt32BE(bytes.length, 8);
        return Buffer.concat([header, bytes]);
      },
      1,
      (response) => {
        if (response.failed) return response.completed === 0 && response.data === undefined;
        if (response.completed !== 1 || !response.data || !validate(response.data)) return false;
        result = response.data as T;
        return true;
      },
      ['historyQueryBlame', 'historyQueryDiff'].includes(Object.getOwnPropertyDescriptor(input, 'kind')?.value)
        ? 32 * 1024 * 1024
        : maximumBytes
    );
    if (owner.closed || result === undefined) {
      owner.closed = true;
      await owner.session.dispose();
      return undefined;
    }
    return result;
  });
  owner.pending = request.then(() => undefined, () => undefined);
  return request;
}
