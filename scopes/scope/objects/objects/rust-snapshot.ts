import { AsyncLocalStorage } from 'async_hooks';
import path from 'path';
import {
  withWorkspacePersistence,
  withWorkspaceSession,
  getRustSnapshotSourceDescriptor,
} from '@teambit/component.sources';
import type BitObject from './object';
import type Repository from './repository';
import type { RawObjectsMap } from './object-list';
import type { NativeImportOperation } from './rust-object-operation';
import type ModelComponent from '../models/model-component';
import type { AddVersionOpts } from '../models/model-component';
import type Version from '../models/version';
import type Lane from '../models/lane';
import Ref from './ref';
import { isTag } from '@teambit/component-version';

type Constructor = { prototype: BitObject; name: string };
type Defaults = { constructor: Constructor; methods: Map<string, unknown> };
const defaults: Defaults[] = [];
const owners = new AsyncLocalStorage<boolean>();
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_FILES = 4096;
const hashString = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const refMethods = { toString: Ref.prototype.toString, isEqual: Ref.prototype.isEqual };

function ordinaryRef(reference: Ref | null | undefined): boolean {
  if (!reference) return true;
  if (Object.getPrototypeOf(reference) !== Ref.prototype) return false;
  const hash = Object.getOwnPropertyDescriptor(reference, 'hash');
  return (
    hashString(hash?.value) &&
    Object.entries(refMethods).every(([name, method]) => {
      const descriptor =
        Object.getOwnPropertyDescriptor(reference, name) || Object.getOwnPropertyDescriptor(Ref.prototype, name);
      return descriptor?.value === method;
    })
  );
}
const methodNames = ['toBuffer', 'serialize', 'compressWithSize', 'getHeader', 'getType', 'hash', 'id'];
const policyMethods = [
  'addVersion',
  'getHead',
  'getRef',
  'hasTag',
  'setHead',
  'setVersion',
  'markVersionAsLocal',
  'addAsOnlyParent',
];

/** Called by the models module after class initialization, before extensions can patch readers. */
export function registerRustSnapshotModels(models: Record<string, Constructor | undefined>): void {
  for (const constructor of Object.values(models)) {
    // Direct source imports can encounter a partially initialized cyclic models module.
    // Unregistered classes retain canonical execution; never capture incomplete defaults.
    if (!constructor || defaults.some((entry) => entry.constructor === constructor)) continue;
    defaults.push({
      constructor,
      methods: new Map([...methodNames, ...policyMethods].map((name) => [name, constructor.prototype[name]])),
    });
  }
}

export function hasDefaultSnapshotMethods(object: BitObject, names: string[]): boolean {
  const entry = defaults.find((candidate) => Object.getPrototypeOf(object) === candidate.constructor.prototype);
  return Boolean(entry && names.every((name) => object[name] === entry.methods.get(name)));
}

export function isRustSnapshotOperation(): boolean {
  return process.env.BIT_RUST_CLIENT_VCS === 'on' && owners.getStore() === true;
}

/** Keep object creation, post-build persistence and index updates in one awaited helper lifetime. */
export function withRustSnapshotOperation<T>(action: () => Promise<T>): Promise<T> {
  if (process.env.BIT_RUST_CLIENT_VCS !== 'on' || owners.getStore()) return action();
  return withWorkspacePersistence(() => owners.run(true, action));
}

async function request<T>(
  input: object,
  count: number,
  parse: (data: any, completed: number, failed: boolean) => T | undefined
): Promise<T | undefined> {
  if (!isRustSnapshotOperation()) return undefined;
  let bytes: Buffer;
  try {
    bytes = Buffer.from(JSON.stringify(input));
  } catch {
    return undefined;
  }
  if (!bytes.length || bytes.length > MAX_BYTES) return undefined;
  return withWorkspaceSession(async (session) => {
    let result: T | undefined;
    let failed = false;
    await session.request(
      (id) => {
        const header = Buffer.alloc(12);
        header.write('BSS1');
        header.writeUInt32BE(id, 4);
        header.writeUInt32BE(bytes.length, 8);
        return Buffer.concat([header, bytes]);
      },
      count,
      (response) => {
        failed = response.failed;
        if (failed && response.completed === 0 && response.data === undefined) return true;
        result = parse(response.data, response.completed, failed);
        return result !== undefined;
      },
      MAX_BYTES
    );
    // Reap a failed writer before canonical suffix replay can touch the same destinations.
    if (failed) await session.dispose();
    return result;
  });
}

type ProjectedObject = {
  type: string;
  hash: string;
  body?: string;
  workspace?: { path: string; hash: string };
};
type Written = { hash: string; inflatedSize: number; compressedSize: number };

function project(object: BitObject): ProjectedObject | undefined {
  const entry = defaults.find((candidate) => Object.getPrototypeOf(object) === candidate.constructor.prototype);
  if (!entry) return undefined;
  const type = entry.constructor.name;
  const descriptor = type === 'Source' ? getRustSnapshotSourceDescriptor(object as any) : undefined;
  if (methodNames.some((name) => !(descriptor && name === 'hash') && object[name] !== entry.methods.get(name)))
    return undefined;
  const hash = object.hash().toString();
  if (!hashString(hash)) return undefined;
  if (descriptor) {
    if (descriptor.sourceHash !== hash) return undefined;
    return { type, hash, workspace: { path: descriptor.path, hash: descriptor.hash } };
  }
  const body = object.toBuffer();
  if (!Buffer.isBuffer(body) || body.length > MAX_BYTES / 2) return undefined;
  return { type, hash, body: body.toString('hex') };
}

/** Prepare final post-build objects as a complete set; preserve public failures through canonical replay. */
export async function persistRustSnapshotObjects(
  repository: Repository,
  objects: BitObject[],
  rawObjects: RawObjectsMap | undefined,
  owner: { uid: number; gid: number } | null
): Promise<number | undefined> {
  if (
    !isRustSnapshotOperation() ||
    !objects.length ||
    objects.length > MAX_FILES ||
    !repository.canPersistSnapshotsNatively()
  )
    return undefined;
  if (objects.some((object) => rawObjects?.has(object))) return undefined;
  const snapshot = objects.slice();
  const projected = snapshot.map(project);
  if (projected.some((object) => !object)) return undefined;
  const directory = path.resolve(repository.getPath());
  const input = { kind: 'commit', objectsDirectory: directory, owner, objects: projected };
  const result = await request(input, snapshot.length, (data, completed) => {
    const written = data?.written;
    if (!Array.isArray(written) || written.length !== completed) return undefined;
    if (
      !written.every(
        (item, index) =>
          item?.hash === projected[index]?.hash &&
          Number.isSafeInteger(item.inflatedSize) &&
          item.inflatedSize > 0 &&
          item.inflatedSize <= 33 * 1024 * 1024 &&
          Number.isSafeInteger(item.compressedSize) &&
          item.compressedSize > 0 &&
          item.compressedSize <= 33 * 1024 * 1024
      )
    )
      return undefined;
    return written as Written[];
  });
  if (!result) return undefined;
  // Live object instances remain authoritative across the asynchronous native write.
  if (
    !repository.canPersistSnapshotsNatively() ||
    path.resolve(repository.getPath()) !== directory ||
    objects.length !== snapshot.length ||
    objects.some((object, index) => object !== snapshot[index]) ||
    snapshot.some((object, index) => JSON.stringify(project(object)) !== JSON.stringify(projected[index]))
  )
    return 0;
  result.forEach((written, index) =>
    repository.recordNativeObjectWrite(snapshot[index], written.inflatedSize, written.compressedSize)
  );
  return result.length;
}

export type SnapshotIndexOperation = Pick<NativeImportOperation, 'request' | 'plan' | 'stats'>;

/** Reuse the existing guarded index adapter and its Rust planner within the snapshot session. */
export function createRustSnapshotIndexOperation(
  repository: Repository,
  owner: { uid: number; gid: number } | null
): SnapshotIndexOperation | undefined {
  if (!isRustSnapshotOperation() || !repository.canPersistSnapshotsNatively()) return undefined;
  const directory = path.resolve(repository.getPath());
  const operation: SnapshotIndexOperation = {
    stats: { frames: 0, operations: 0, persisted: 0, indexes: 0, stalePlans: 0, missingHits: 0 },
    async request<T>(input: object, parse: (value: any) => T): Promise<T | undefined> {
      if (!repository.canPersistSnapshotsNatively() || path.resolve(repository.getPath()) !== directory)
        return undefined;
      const kind = (input as { kind: string }).kind;
      if (kind !== 'index' && kind !== 'indexWrite') return undefined;
      const result = await request(
        kind === 'indexWrite' ? { ...input, objectsDirectory: directory, owner } : input,
        1,
        (data, completed, failed) =>
          completed === 1 && !failed ? parse(kind === 'index' ? data?.actions : data?.saved) : undefined
      );
      return repository.canPersistSnapshotsNatively() && path.resolve(repository.getPath()) === directory
        ? result
        : undefined;
    },
    async plan<T>(projection: () => object, parse: (value: any) => T) {
      const input = projection();
      const initial = JSON.stringify(input);
      const value = await operation.request(input, parse);
      if (value === undefined) return undefined;
      return {
        apply<R>(run: (result: T) => R): R | undefined {
          if (JSON.stringify(projection()) !== initial || !repository.canPersistSnapshotsNatively()) {
            operation.stats.stalePlans++;
            return undefined;
          }
          return run(value);
        },
      };
    },
  };
  return operation;
}

/** Mainline parent/head/tag policy; lane and custom model policies retain canonical execution. */
export async function addRustSnapshotVersion(
  component: ModelComponent,
  version: Version,
  versionToAdd: string,
  lane?: Lane,
  previouslyUsedVersion?: string,
  options: AddVersionOpts = {}
): Promise<string | undefined> {
  if (!isRustSnapshotOperation() || lane || !component.canAddSnapshotVersionNatively(version)) return undefined;
  const readReferences = () => {
    const head = component.getHead();
    const parent = previouslyUsedVersion ? component.getRef(previouslyUsedVersion) : undefined;
    return ordinaryRef(head) && ordinaryRef(parent) ? { head, parent } : undefined;
  };
  if (!readReferences()) return undefined;
  const projection = () => {
    const head = component.getHead();
    const parent = previouslyUsedVersion ? component.getRef(previouslyUsedVersion) : undefined;
    return {
      kind: 'plan',
      hash: version.hash().toString(),
      version: versionToAdd,
      head: head?.toString(),
      parent: parent?.toString(),
      hasTag: component.hasTag(versionToAdd),
      tag: isTag(versionToAdd),
      isLegacy: version.isLegacy,
      setHeadAsParent: Boolean(options.setHeadAsParent),
      detachHead: Boolean(options.detachHead),
      overrideHead: Boolean(options.overrideHead),
    };
  };
  const input = projection();
  const model = component.toBuffer(false).toString('hex');
  const initialVersion = version.toBuffer(false).toString('hex');
  // Bound a successful acknowledgement to the requested policy before mutating live instances.
  const expectedParent =
    input.head && input.head !== input.version && !input.hasTag && !input.isLegacy
      ? (input.setHeadAsParent ? input.head : input.parent) || input.head
      : undefined;
  const olderParent = Boolean(input.parent && input.head && input.parent !== input.head);
  const expectedDetached = olderParent && !input.overrideHead && input.detachHead;
  const result = await request(input, 1, (data, completed, failed) =>
    completed === 1 &&
    !failed &&
    typeof data?.detached === 'boolean' &&
    typeof data?.tag === 'boolean' &&
    (data.parent === undefined || hashString(data.parent)) &&
    data.parent === expectedParent &&
    data.detached === expectedDetached &&
    data.tag === input.tag &&
    !(input.detachHead && input.overrideHead) &&
    !(olderParent && !input.overrideHead && !input.detachHead)
      ? (data as { parent?: string; detached: boolean; tag: boolean })
      : undefined
  );
  if (
    !result ||
    !component.canAddSnapshotVersionNatively(version) ||
    !readReferences() ||
    JSON.stringify(projection()) !== JSON.stringify(input) ||
    component.toBuffer(false).toString('hex') !== model ||
    version.toBuffer(false).toString('hex') !== initialVersion ||
    result.tag !== input.tag ||
    (result.parent && ![input.parent, input.head].includes(result.parent))
  )
    return undefined;
  if (result.parent) {
    const head = component.getHead();
    const parent = previouslyUsedVersion ? component.getRef(previouslyUsedVersion) : undefined;
    const reference = input.setHeadAsParent ? head : parent || head;
    if (!reference) return undefined;
    version.addAsOnlyParent(reference);
  }
  if (result.detached) component.detachedHeads.setHead(version.hash());
  else {
    component.setHead(version.hash());
    component.detachedHeads.clearCurrent();
  }
  if (result.tag) component.setVersion(versionToAdd, version.hash());
  component.markVersionAsLocal(versionToAdd);
  return versionToAdd;
}
