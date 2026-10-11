import { hasCanonicalLegacyLoggerMethods } from '@teambit/legacy.logger';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { AsyncLocalStorage, AsyncResource } from 'async_hooks';
import { PassThrough } from 'stream';
import type { Readable } from 'stream';
import type Repository from './repository';
import type ModelComponent from '../models/model-component';
import type Version from '../models/version';
import type { ObjectItem } from './object-list';
import Ref, { hasCanonicalRefMethods } from './ref';
import type * as Sources from '@teambit/component.sources';
import { isRustSnapshotOperation, withRustSnapshotOperation } from './rust-snapshot';
import { canReadCacheNatively } from '@teambit/harmony.modules.in-memory-cache';
import { canReadLiveObjectsNatively } from './live-objects';

type DefaultClass = {
  constructor: any;
  methods: Map<string, PropertyDescriptor | undefined>;
  statics: Map<string | symbol, PropertyDescriptor | undefined>;
  setHas?: PropertyDescriptor;
};
type ItemState = {
  token: string;
  index: number;
  hash: string;
  scope?: string;
  file: string;
  digest: string;
  size: number;
  getter: () => Buffer;
};
type Owner = {
  session?: Parameters<Parameters<typeof Sources.withWorkspaceSession>[0]>[0];
  requests: Promise<void>;
  directory?: string;
  directoryPromise?: Promise<string | undefined>;
  items: WeakMap<ObjectItem, ItemState>;
  lists: WeakMap<object, { token: string; count: number; hash: string; signature: string; items: ObjectItem[] }>;
};
// eslint-disable-next-line no-var
var classes: Map<string, DefaultClass> | undefined;
const owners = new AsyncLocalStorage<Owner>();
const streamOwners = new WeakMap<
  Readable,
  { run?: (action: () => Promise<void>) => Promise<void>; completed?: () => void; tar?: Readable }
>();
const hashPattern = /^[a-f0-9]{40}$/;
const limits = 4096;

/** Capture readers where their canonical classes are defined, before extensions install hooks. */
export function registerRustTransferClass(name: string, constructor: any, methods: string[]): void {
  classes ||= new Map();
  if (!constructor || classes.has(name)) return;
  classes.set(name, {
    constructor,
    setHas: name === 'ExtensionDataList' ? Object.getOwnPropertyDescriptor(Set.prototype, 'has') : undefined,
    methods: new Map(methods.map((method) => [method, methodDescriptor(constructor.prototype, method)])),
    statics: new Map(
      (name === 'ExtensionDataList'
        ? ['coreExtensionsNames']
        : name === 'Array'
          ? ['isArray', Symbol.species]
          : name === 'Version'
            ? ['parse']
            : name === 'Repository'
              ? ['onPostObjectRead', 'hasPostObjectReadTransformer']
              : name === 'BitObject'
                ? ['parseObject', 'parseObjectWithSize']
                : []
      ).map((method) => [method, Object.getOwnPropertyDescriptor(constructor, method)])
    ),
  });
}
export function registerRustTransferRepositoryHooks(constructor: any): void {
  const registration = classes?.get('Repository');
  if (!registration || registration.constructor !== constructor) return;
  for (const name of ['onPostObjectRead', 'hasPostObjectReadTransformer'])
    registration.statics.set(name, Object.getOwnPropertyDescriptor(constructor, name));
}
function methodDescriptor(owner: object, name: string): PropertyDescriptor | undefined {
  let current: object | null = owner;
  while (current) {
    const descriptor = Object.getOwnPropertyDescriptor(current, name);
    if (descriptor) return descriptor;
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}
function sameDescriptor(actual: PropertyDescriptor | undefined, expected: PropertyDescriptor | undefined): boolean {
  if (!actual || !expected) return actual === expected;
  return ['value', 'get', 'set', 'writable', 'enumerable', 'configurable'].every(
    (key) => actual[key] === expected[key]
  );
}
function ordinary(value: any, name: string): boolean {
  const captured = classes?.get(name);
  return Boolean(
    captured &&
      value &&
      Object.getPrototypeOf(value) === captured.constructor.prototype &&
      (!captured.setHas || sameDescriptor(Object.getOwnPropertyDescriptor(Set.prototype, 'has'), captured.setHas)) &&
      [...captured.statics].every(([method, expected]) =>
        sameDescriptor(Object.getOwnPropertyDescriptor(captured.constructor, method), expected)
      ) &&
      [...captured.methods].every(
        ([method, expected]) =>
          !Object.getOwnPropertyDescriptor(value, method) &&
          sameDescriptor(methodDescriptor(captured.constructor.prototype, method), expected)
      ) &&
      Reflect.ownKeys(value).every((key) => 'value' in Object.getOwnPropertyDescriptor(value, key)!)
  );
}
function ordinaryArray(value: any): boolean {
  if (!ordinary(value, 'Array') || value.length > limits) return false;
  const keys = Reflect.ownKeys(value);
  return (
    keys.length === value.length + 1 &&
    keys.every(
      (key) =>
        key === 'length' || (typeof key === 'string' && /^(0|[1-9][0-9]*)$/.test(key) && Number(key) < value.length)
    )
  );
}
function refHash(ref: Ref | undefined): string | undefined {
  if (!ref || !hasCanonicalRefMethods(ref)) return undefined;
  const hash = Object.getOwnPropertyDescriptor(ref, 'hash')?.value;
  return typeof hash === 'string' && hashPattern.test(hash) ? hash : undefined;
}
export function withRustTransferOperation<T>(action: () => Promise<T>): Promise<T> {
  if (process.env.BIT_RUST_CLIENT_VCS !== 'on' || owners.getStore()) return action();
  const owner: Owner = { items: new WeakMap(), lists: new WeakMap(), requests: Promise.resolve() };
  const run = () =>
    owners.run(owner, async () => {
      try {
        return await action();
      } finally {
        await owner.requests;
        const directory = owner.directory || (await owner.directoryPromise?.catch(() => undefined));
        if (directory) await fs.remove(directory);
      }
    });
  return withRustSnapshotOperation(async () => {
    const { withWorkspaceSession } = require('@teambit/component.sources') as typeof Sources;
    let entered = false;
    const result = await withWorkspaceSession(async (session) => {
      entered = true;
      owner.session = session;
      return run();
    });
    return entered ? (result as T) : run();
  });
}
export function requestRustTransfer<T>(input: object, validate: (data: any) => boolean): Promise<T | undefined> {
  const owner = owners.getStore();
  if (!owner?.session) return Promise.resolve(undefined);
  const session = owner.session;
  const request = owner.requests.then(async () => {
    if (!session.usable) return undefined;
    let bytes: Buffer;
    try {
      bytes = Buffer.from(JSON.stringify(input));
    } catch {
      return undefined;
    }
    if (!bytes.length || bytes.length > 4 * 1024 * 1024) return undefined;
    let result: T | undefined;
    await session.request(
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
      4 * 1024 * 1024
    );
    if (!result || (result as any).failed === true) await session.dispose();
    return result;
  });
  owner.requests = request.then(
    () => undefined,
    () => undefined
  );
  return request;
}
async function stagingDirectory(): Promise<string | undefined> {
  const owner = owners.getStore();
  if (!owner || !isRustSnapshotOperation()) return undefined;
  owner.directoryPromise ||= fs.mkdtemp(path.join(os.tmpdir(), 'bit-transfer-')).catch(() => undefined);
  owner.directory = await owner.directoryPromise;
  return owner.directory;
}
function repositoryEligible(repo: Repository): boolean {
  const object = classes?.get('BitObject');
  if (
    !object ||
    [...object.statics].some(
      ([method, expected]) => !sameDescriptor(Object.getOwnPropertyDescriptor(object.constructor, method), expected)
    )
  )
    return false;
  return (
    ordinary(repo, 'Repository') &&
    (repo as any).onRead === (repo as any).defaultOnRead &&
    !(repo as any).isContentTransformed() &&
    canReadCacheNatively((repo as any).cache) &&
    canReadLiveObjectsNatively((repo as any).liveObjects)
  );
}
function plainData(value: any): boolean {
  return (
    Boolean(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) &&
    Reflect.ownKeys(value).every((key) => 'value' in Object.getOwnPropertyDescriptor(value, key)!)
  );
}
function ordinaryArtifactReferences(extensions: any): boolean {
  return extensions.every((entry: any) => {
    const data = Object.getOwnPropertyDescriptor(entry, 'data');
    if (!data || !('value' in data)) return false;
    if (!data.value) return true;
    if (!plainData(data.value)) return false;
    const artifacts = Object.getOwnPropertyDescriptor(data.value, 'artifacts');
    if (!artifacts) return true;
    if (!('value' in artifacts)) return false;
    if (!artifacts.value) return true;
    return (
      ordinaryArray(artifacts.value) &&
      artifacts.value.every((artifact: any) => {
        if (!plainData(artifact)) return false;
        const files = Object.getOwnPropertyDescriptor(artifact, 'files');
        if (!files || !('value' in files) || !files.value) return false;
        const refs = Object.getOwnPropertyDescriptor(files.value, 'refs');
        return Boolean(
          refs &&
            'value' in refs &&
            ordinaryArray(refs.value) &&
            refs.value.every(
              (row: any) => plainData(row) && Object.getOwnPropertyDescriptor(row, 'ref') && refHash(row.ref)
            )
        );
      })
    );
  });
}
function expectedReferences(version: Version): object | undefined {
  if (
    !ordinary(version, 'Version') ||
    !ordinary(version.extensions, 'ExtensionDataList') ||
    !ordinaryArray(version.files) ||
    version.extensions.some((entry) => !ordinary(entry, 'ExtensionDataEntry')) ||
    !ordinaryArtifactReferences(version.extensions) ||
    version.files.some(
      (file) => !plainData(file) || !Object.getOwnPropertyDescriptor(file, 'file') || !refHash(file.file)
    )
  )
    return undefined;
  const sources = version.refsWithOptions(false, false).map(refHash);
  const all = version.refsWithOptions(false, true).map(refHash);
  if (sources.some((hash) => !hash) || all.some((hash) => !hash)) return undefined;
  const edges = refHash(version.flattenedEdgesRef),
    graph = refHash(version.dependenciesGraphRef);
  const sourceCount = version.files.length;
  return {
    sources: sources.slice(0, sourceCount),
    artifacts: all.slice(sourceCount, all.length - (edges ? 1 : 0) - (graph ? 1 : 0)),
    ...(edges ? { edges } : {}),
    ...(graph ? { graph } : {}),
  };
}
function collectionRow(row: any, directory: string): boolean {
  return (
    row &&
    typeof row.hash === 'string' &&
    hashPattern.test(row.hash) &&
    typeof row.type === 'string' &&
    Number.isInteger(row.index) &&
    row.index >= 0 &&
    row.index < limits &&
    typeof row.compressedPath === 'string' &&
    path.dirname(row.compressedPath) === directory &&
    typeof row.compressedSha1 === 'string' &&
    hashPattern.test(row.compressedSha1) &&
    Number.isInteger(row.bytes) &&
    row.bytes >= 0 &&
    row.bytes <= 32 * 1024 * 1024
  );
}
function lazyItem(row: any, token: string): ObjectItem {
  const owner = owners.getStore()!;
  const item = { ref: new Ref(row.hash), type: row.type, ...(row.scope ? { scope: row.scope } : {}) } as ObjectItem;
  const getter = () => {
    const bytes = fs.readFileSync(row.compressedPath);
    if (bytes.length !== row.bytes || crypto.createHash('sha1').update(bytes).digest('hex') !== row.compressedSha1)
      throw new Error(`outgoing object snapshot changed: ${row.hash}`);
    Object.defineProperty(item, 'buffer', { value: bytes, writable: true, enumerable: true, configurable: true });
    owner.items.delete(item);
    return bytes;
  };
  Object.defineProperty(item, 'buffer', { get: getter, enumerable: true, configurable: true });
  owner.items.set(item, {
    token,
    index: row.index,
    hash: row.hash,
    scope: row.scope,
    file: row.compressedPath,
    digest: row.compressedSha1,
    size: row.bytes,
    getter,
  });
  return item;
}
/** Rust owns Version reference selection and frozen compressed file reads; Node retains metadata hooks. */
export async function collectRustTransferVersions(
  repo: Repository,
  versions: Version[],
  locallyChanged: string[],
  mode: 'export' | 'fetch',
  strict = false,
  includeArtifacts = true
): Promise<ObjectItem[] | undefined> {
  if (
    !owners.getStore() ||
    !hasCanonicalLegacyLoggerMethods() ||
    !repositoryEligible(repo) ||
    !ordinaryArray(versions) ||
    !ordinaryArray(locallyChanged) ||
    versions.some((version) => !ordinary(version, 'Version'))
  )
    return undefined;
  const prepared = versions.map((version) => ({
    hash: refHash(version.hash()),
    locallyChanged: locallyChanged.includes(version.hash().toString()),
    expected: expectedReferences(version),
  }));
  if (prepared.some((version) => !version.hash || !version.expected)) return undefined;
  const directory = await stagingDirectory();
  if (!directory || !repositoryEligible(repo) || versions.some((version) => !ordinary(version, 'Version')))
    return undefined;
  const snapshot = JSON.stringify(prepared),
    objectsDirectory = repo.getPath();
  const result = await requestRustTransfer<any>(
    {
      kind: 'transferCollect',
      mode,
      objectsDirectory,
      stagingDirectory: directory,
      versions: prepared,
      throwForMissingLocalArtifacts: strict,
      includeArtifacts,
    },
    (data) =>
      typeof data.token === 'string' &&
      hashPattern.test(data.token) &&
      Array.isArray(data.objects) &&
      data.objects.length === data.count &&
      data.objects.length <= limits &&
      data.objects.every((row: any) => collectionRow(row, directory))
  );
  if (
    !result ||
    !repositoryEligible(repo) ||
    !hasCanonicalLegacyLoggerMethods() ||
    !ordinaryArray(versions) ||
    versions.some((version) => !ordinary(version, 'Version')) ||
    repo.getPath() !== objectsDirectory ||
    JSON.stringify(
      versions.map((version) => ({
        hash: refHash(version.hash()),
        locallyChanged: locallyChanged.includes(version.hash().toString()),
        expected: expectedReferences(version),
      }))
    ) !== snapshot
  )
    return undefined;
  return result.objects.map((row: any) => lazyItem(row, result.token));
}
export async function collectRustExportObjects(
  component: ModelComponent,
  repo: Repository,
  versions: string[],
  strict: boolean,
  workspaceId?: any
): Promise<ObjectItem[] | undefined> {
  if (
    !owners.getStore() ||
    !hasCanonicalLegacyLoggerMethods() ||
    !ordinary(component, 'ModelComponent') ||
    !repositoryEligible(repo) ||
    !ordinaryArray(versions)
  )
    return undefined;
  const local = await component.getLocalTagsOrHashes(repo, workspaceId);
  const localHashes = local.map((label) => refHash(component.getRef(label)!));
  const loaded = await Promise.all(versions.map((label) => component.loadVersion(label, repo)));
  return collectRustTransferVersions(repo, loaded, localHashes.filter(Boolean) as string[], 'export', strict);
}
function itemInput(item: ObjectItem): object | undefined {
  if (
    !item ||
    Reflect.ownKeys(item).some((key) => key !== 'buffer' && !('value' in Object.getOwnPropertyDescriptor(item, key)!))
  )
    return undefined;
  const owner = owners.getStore()!;
  const state = owner.items.get(item);
  if (
    state &&
    Object.getOwnPropertyDescriptor(item, 'buffer')?.get === state.getter &&
    refHash(item.ref) === state.hash
  )
    return { collectionToken: state.token, index: state.index, ...(item.scope ? { scope: item.scope } : {}) };
  const property = Object.getOwnPropertyDescriptor(item, 'buffer');
  if (!property || !('value' in property) || !Buffer.isBuffer(property.value) || item.type === 'Source')
    return undefined;
  const hash = refHash(item.ref);
  return hash
    ? {
        metadata: {
          hash,
          ...(item.type ? { type: item.type } : {}),
          ...(item.scope ? { scope: item.scope } : {}),
          compressed: property.value.toString('hex'),
        },
      }
    : undefined;
}
export async function prepareRustTransferList(list: { objects: ObjectItem[] }): Promise<boolean> {
  const owner = owners.getStore();
  if (!owner || !ordinary(list, 'ObjectList') || !ordinaryArray(list.objects) || !list.objects.length) return false;
  const objects = list.objects.map(itemInput);
  if (objects.some((item) => !item)) return false;
  const snapshot = list.objects.slice();
  const result = await requestRustTransfer<any>(
    { kind: 'transferInitialize', objects },
    (data) =>
      typeof data.token === 'string' &&
      hashPattern.test(data.token) &&
      Number.isInteger(data.count) &&
      data.count === objects.length &&
      typeof data.objectsHash === 'string' &&
      hashPattern.test(data.objectsHash)
  );
  if (
    !result ||
    list.objects.length !== snapshot.length ||
    snapshot.some((item, index) => item !== list.objects[index]) ||
    JSON.stringify(list.objects.map(itemInput)) !== JSON.stringify(objects)
  )
    return false;
  owner.lists.set(list, {
    token: result.token,
    count: result.count,
    hash: result.objectsHash,
    signature: JSON.stringify(objects),
    items: snapshot,
  });
  return true;
}
export function rustTransferObjectsHash(list: object): string | undefined {
  return transferListState(list)?.hash;
}
function transferListState(list: any) {
  const owner = owners.getStore(),
    state = owner?.lists.get(list);
  if (
    !state ||
    !ordinary(list, 'ObjectList') ||
    list.objects.length !== state.items.length ||
    !ordinaryArray(list.objects) ||
    state.items.some((item, index) => item !== list.objects[index])
  )
    return undefined;
  return JSON.stringify(list.objects.map(itemInput)) === state.signature ? state : undefined;
}
export function rustTransferTar(
  list: object,
  mode: 'export' | 'fetch' = 'export',
  scopeName?: string
): Readable | undefined {
  const owner = owners.getStore(),
    prepared = transferListState(list);
  if (!owner || !prepared) return undefined;
  const stream = new PassThrough();
  const fallbackToCanonical = () => {
    if (stream.destroyed) return;
    owner.lists.delete(list);
    const fallback =
      mode === 'fetch'
        ? require('./object-list').ObjectList.fromObjectStreamToTar(
            require('stream').Readable.from(prepared.items),
            scopeName
          )
        : (list as any).toTar();
    stream.once('close', () => fallback.destroy());
    fallback.on('error', (error: Error) => stream.destroy(error));
    if (stream.destroyed) fallback.destroy();
    else fallback.pipe(stream);
  };
  void (async () => {
    const directory = await stagingDirectory();
    if (stream.destroyed) return;
    if (!directory) return fallbackToCanonical();
    const filename = path.join(directory!, `archive-${crypto.randomBytes(8).toString('hex')}.tar`);
    const count = prepared.count + (mode === 'fetch' ? 2 : 0);
    const mtimeSeconds = Array.from({ length: count }, () => Math.floor(Date.now() / 1000));
    const result = await requestRustTransfer<any>(
      {
        kind: 'transferArchive',
        token: prepared.token,
        path: filename,
        mtimeSeconds,
        mode,
        ...(scopeName ? { scopeName } : {}),
      },
      (data) => data.path === filename && data.count === prepared.count && data.objectsHash === prepared.hash
    );
    if (stream.destroyed) return;
    if (!result) return fallbackToCanonical();
    const input = fs.createReadStream(filename);
    stream.once('close', () => input.destroy());
    input.on('error', (error) => stream.destroy(error));
    input.pipe(stream);
  })().catch((error) => stream.destroy(error));
  return stream;
}

/** The public object stream keeps its helper and private fallback files until transport completion. */
export function registerRustTransferReadable(readable: Readable): void {
  if (process.env.BIT_RUST_CLIENT_VCS === 'on') streamOwners.set(readable, {});
}
export function withRustTransferReadable(readable: Readable, produce: () => Promise<void>): Promise<void> {
  const state = streamOwners.get(readable);
  if (!state) return produce();
  return withRustTransferOperation(async () => {
    state.run = AsyncResource.bind((action: () => Promise<void>) => action());
    const consumed = new Promise<void>((resolve) => {
      state.completed = resolve;
    });
    readable.once('close', () => {
      if (!state.tar) state.completed?.();
    });
    readable.once('end', () => {
      if (!state.tar) state.completed?.();
    });
    try {
      await produce();
      await consumed;
    } finally {
      streamOwners.delete(readable);
    }
  });
}
export function rustTransferReadableTar(
  readable: Readable,
  scopeName: string,
  canonical: (items: ObjectItem[], error?: Error) => Readable
): Readable | undefined {
  const state = streamOwners.get(readable);
  if (!state) return undefined;
  const output = new PassThrough();
  state.tar = output;
  const items: ObjectItem[] = [];
  readable.on('data', (item) => items.push(item));
  output.once('close', () => {
    readable.destroy();
    state.completed?.();
  });
  const pipeInput = (input: Readable) => {
    output.once('close', () => input.destroy());
    input.on('error', (error: Error) => output.destroy(error));
    if (output.destroyed) input.destroy();
    else input.pipe(output);
  };
  readable.once('error', (error) => {
    if (!output.destroyed) pipeInput(canonical(items, error));
  });
  readable.once('end', () => {
    if (output.destroyed) return;
    const run = state.run || ((action: () => Promise<void>) => action());
    void run(async () => {
      if (output.destroyed) return;
      const { ObjectList } = require('./object-list');
      const list = new ObjectList(items);
      const prepared = await prepareRustTransferList(list);
      if (output.destroyed) return;
      pipeInput(prepared ? rustTransferTar(list, 'fetch', scopeName)! : canonical(items));
    }).catch((error) => output.destroy(error));
  });
  return output;
}

/** Default filesystem remotes write the frozen transfer directly into their pending object store. */
export async function persistRustTransferPending(
  repo: Repository,
  list: { objects: ObjectItem[] },
  pendingDir: string,
  owner: { uid: number; gid: number } | null | undefined
): Promise<number | undefined> {
  const state = transferListState(list);
  if (!state || !ordinary(repo, 'Repository') || !path.isAbsolute(pendingDir)) return undefined;
  const result = await requestRustTransfer<any>(
    { kind: 'transferPending', token: state.token, pendingDir, owner: owner || null },
    (data) =>
      Number.isInteger(data.completed) &&
      data.completed >= 0 &&
      data.completed <= state.count &&
      typeof data.failed === 'boolean' &&
      (data.failed ? data.completed < state.count : data.completed === state.count)
  );
  return result?.completed;
}

export function hasRustTransferClass(value: object, name: string): boolean {
  return ordinary(value, name);
}

const missingObjectIndices = new WeakMap<ObjectItem[], number[]>();
export function rustTransferMissingObjectIndices(items: ObjectItem[]): number[] {
  return missingObjectIndices.get(items) || [];
}

export async function collectRustTransferObjects(
  repo: Repository,
  references: Ref[]
): Promise<ObjectItem[] | undefined> {
  if (
    !owners.getStore() ||
    !hasCanonicalLegacyLoggerMethods() ||
    !repositoryEligible(repo) ||
    !ordinaryArray(references)
  )
    return undefined;
  if (!references.length) return [];
  const refs = references.map(refHash);
  if (refs.some((hash) => !hash)) return undefined;
  const directory = await stagingDirectory();
  if (!directory) return undefined;
  const objectsDirectory = repo.getPath();
  const result = await requestRustTransfer<any>(
    {
      kind: 'transferCollect',
      mode: 'objects',
      objectsDirectory,
      stagingDirectory: directory,
      refs,
      gracefulMissing: true,
    },
    (data) =>
      typeof data.token === 'string' &&
      hashPattern.test(data.token) &&
      Array.isArray(data.missingIndices) &&
      data.missingIndices.every((index: any, position: number) =>
        Number.isInteger(index) && index >= 0 && index < refs.length &&
        (position === 0 || index > data.missingIndices[position - 1])
      ) &&
      Array.isArray(data.objects) &&
      data.objects.length === data.count &&
      data.objects.length <= limits &&
      data.objects.every((row: any) => collectionRow(row, directory)) &&
      new Set(data.objects.map((row: any) => row.hash)).size === data.objects.length &&
      data.objects.every((row: any) => refs.includes(row.hash)) &&
      refs.every((hash, index) =>
        data.missingIndices.includes(index)
          ? !data.objects.some((row: any) => row.hash === hash)
          : data.objects.some((row: any) => row.hash === hash)
      )
  );
  if (
    !result ||
    !repositoryEligible(repo) ||
    repo.getPath() !== objectsDirectory ||
    JSON.stringify(references.map(refHash)) !== JSON.stringify(refs)
  )
    return undefined;
  const items = result.objects.map((row: any) => {
    const item = lazyItem(row, result.token);
    item.ref = references[refs.indexOf(row.hash)];
    delete item.type;
    return item;
  });
  missingObjectIndices.set(items, result.missingIndices);
  return items;
}
