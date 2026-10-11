import path from 'path';
import { LaneId } from '@teambit/lane-id';
import { ComponentID } from '@teambit/component-id';
import { withWorkspaceSession } from '@teambit/component.sources';
import Ref from './ref';
import { isRustSnapshotOperation } from './rust-snapshot';

type Session = Parameters<Parameters<typeof withWorkspaceSession>[0]>[0];
type Pending = { filePath: string; unmerged: any[]; hasChanged: boolean; toObject(): any[] };
type Action =
  | { kind: 'add'; entry: any }
  | { kind: 'remove'; ids: Array<{ scope?: string; name: string }> }
  | { kind: 'removeAll' };
type Context = { owner: Pending; fingerprint: string; token: string; revision: number };
const contexts = new WeakMap<Session, Context>();
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_ENTRIES = 4096;
const refDefaults = { toString: Ref.prototype.toString, isEqual: Ref.prototype.isEqual };
const laneDefaults = { toObject: LaneId.prototype.toObject, toString: LaneId.prototype.toString };
const componentFactory = ComponentID.fromObject;
const componentGetters = Object.fromEntries(['fullName', 'scope'].map((name) => [name, ownComponentGetter(name)]));
function ownComponentGetter(name: string) {
  return Object.getOwnPropertyDescriptor(ComponentID.prototype, name)?.get;
}
const arrayMethods = Object.fromEntries(['push', 'map', 'find', 'every'].map((name) => [name, Array.prototype[name]]));
export function projectRustUnmergedIds(ids: ComponentID[]): Array<{ name: string; scope: string }> | undefined {
  if (!isRustSnapshotOperation() || !Array.isArray(ids) || ids.length > MAX_ENTRIES) return undefined;
  const result: Array<{ name: string; scope: string }> = [];
  for (const id of ids) {
    if (
      !id ||
      Object.getPrototypeOf(id) !== ComponentID.prototype ||
      Object.entries(componentGetters).some(
        ([name, getter]) =>
          (Object.getOwnPropertyDescriptor(id, name) || Object.getOwnPropertyDescriptor(ComponentID.prototype, name))
            ?.get !== getter
      )
    )
      return undefined;
    const legacy = Object.getOwnPropertyDescriptor(id, '_legacy')?.value;
    const name = legacy && Object.getOwnPropertyDescriptor(legacy, 'name')?.value;
    const scopeDescriptor = legacy && Object.getOwnPropertyDescriptor(legacy, 'scope');
    if (!scopeDescriptor || !Object.prototype.hasOwnProperty.call(scopeDescriptor, 'value')) return undefined;
    const scope = scopeDescriptor.value;
    const defaultScope = Object.getOwnPropertyDescriptor(id, '_scope')?.value;
    if (
      typeof name !== 'string' ||
      (scope !== undefined && typeof scope !== 'string') ||
      typeof (scope || defaultScope) !== 'string'
    )
      return undefined;
    result.push({ name, scope: scope || defaultScope });
  }
  return result;
}
// Class registration can happen through a cyclic legacy scope import.
// eslint-disable-next-line no-var
var pendingDefaults: { prototype: object; methods: Map<string, unknown> } | undefined;
export function registerRustUnmergedComponents(constructor: { prototype: object }): void {
  if (!pendingDefaults)
    pendingDefaults = {
      prototype: constructor.prototype,
      methods: new Map(
        [
          'addEntry',
          'getEntry',
          'getComponents',
          'removeComponent',
          'removeMultipleComponents',
          'removeAllComponents',
          'write',
          'toObject',
        ].map((name) => [name, constructor.prototype[name]])
      ),
    };
}
const own = (object: object, name: string) => Object.getOwnPropertyDescriptor(object, name);
const ordinaryMethod = (object: object, prototype: object, name: string, expected: unknown) =>
  (own(object, name) || own(prototype, name))?.value === expected;
function ordinaryRef(ref: Ref): boolean {
  return Boolean(
    ref &&
      Object.getPrototypeOf(ref) === Ref.prototype &&
      /^[a-f0-9]{40}$/.test(own(ref, 'hash')?.value) &&
      Object.entries(refDefaults).every(([name, method]) => ordinaryMethod(ref, Ref.prototype, name, method))
  );
}
function ordinaryLane(lane: LaneId): boolean {
  return Boolean(
    lane &&
      Object.getPrototypeOf(lane) === LaneId.prototype &&
      Object.entries(laneDefaults).every(([name, method]) => ordinaryMethod(lane, LaneId.prototype, name, method)) &&
      typeof own(lane, 'name')?.value === 'string' &&
      Boolean(own(lane, 'scope') && 'value' in own(lane, 'scope')!) &&
      (own(lane, 'scope')?.value === undefined || typeof own(lane, 'scope')?.value === 'string')
  );
}
function jsonData(value: unknown, seen = new Set<object>(), depth = 0): boolean {
  if (depth > 64) return false;
  if (value === null || value === undefined || ['string', 'boolean'].includes(typeof value)) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype && prototype !== Array.prototype) return false;
  if (own(value, 'toJSON') || (prototype && own(prototype, 'toJSON'))) return false;
  seen.add(value);
  const valid = Object.values(Object.getOwnPropertyDescriptors(value)).every(
    (descriptor) => !descriptor.get && !descriptor.set && jsonData(descriptor.value, seen, depth + 1)
  );
  seen.delete(value);
  return valid;
}
function ordinaryEntry(entry: any): boolean {
  if (
    !entry ||
    Object.getPrototypeOf(entry) !== Object.prototype ||
    Object.values(Object.getOwnPropertyDescriptors(entry)).some((descriptor) => descriptor.get || descriptor.set) ||
    !jsonData(entry.id) ||
    typeof entry.id?.name !== 'string' ||
    (entry.id.scope !== undefined && typeof entry.id.scope !== 'string') ||
    !ordinaryRef(entry.head) ||
    !ordinaryLane(entry.laneId)
  )
    return false;
  if (entry.unrelated !== undefined && typeof entry.unrelated !== 'boolean') {
    const unrelated = entry.unrelated;
    if (
      !unrelated ||
      Object.getPrototypeOf(unrelated) !== Object.prototype ||
      Object.values(Object.getOwnPropertyDescriptors(unrelated)).some(
        (descriptor) => descriptor.get || descriptor.set
      ) ||
      !ordinaryRef(unrelated.unrelatedHead) ||
      !ordinaryRef(unrelated.headOnCurrentLane) ||
      !ordinaryLane(unrelated.unrelatedLaneId)
    )
      return false;
  }
  return Object.entries(entry).every(
    ([name, value]) => ['head', 'laneId', 'unrelated'].includes(name) || jsonData(value)
  );
}
function eligible(owner: Pending): boolean {
  return Boolean(
    pendingDefaults &&
      Object.getPrototypeOf(owner) === pendingDefaults.prototype &&
      ComponentID.fromObject === componentFactory &&
      [...pendingDefaults.methods].every(([name, method]) =>
        ordinaryMethod(owner, pendingDefaults!.prototype, name, method)
      ) &&
      ['filePath', 'unmerged', 'hasChanged'].every((name) => !own(owner, name)?.get) &&
      typeof owner.filePath === 'string' &&
      path.isAbsolute(owner.filePath) &&
      path.basename(owner.filePath) === 'unmerged.json' &&
      Array.isArray(owner.unmerged) &&
      Object.getPrototypeOf(owner.unmerged) === Array.prototype &&
      Object.entries(arrayMethods).every(([name, method]) =>
        ordinaryMethod(owner.unmerged, Array.prototype, name, method)
      ) &&
      owner.unmerged.length <= MAX_ENTRIES &&
      new Set(owner.unmerged).size === owner.unmerged.length &&
      owner.unmerged.every(ordinaryEntry)
  );
}
function fingerprint(owner: Pending): string | undefined {
  if (!eligible(owner)) return undefined;
  const value = JSON.stringify(owner.toObject());
  return Buffer.byteLength(value) <= MAX_BYTES ? value : undefined;
}
const token = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
async function request(session: Session, input: object, validate: (data: any) => boolean): Promise<any | undefined> {
  const bytes = Buffer.from(JSON.stringify(input));
  if (bytes.length > MAX_BYTES) return undefined;
  let data: any;
  let failed = false;
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
      failed = response.failed;
      if (failed) return response.completed === 0 && response.data === undefined;
      if (response.completed !== 1 || !response.data || !validate(response.data)) return false;
      data = response.data;
      return true;
    },
    MAX_BYTES
  );
  if (failed || !data) {
    contexts.delete(session);
    await session.dispose();
  }
  return data;
}
async function initialize(session: Session, owner: Pending, serialized: string): Promise<Context | undefined> {
  const existing = contexts.get(session);
  if (existing?.owner === owner && existing.fingerprint === serialized) return existing;
  const result = await request(
    session,
    { kind: 'initialize', entries: JSON.parse(serialized) },
    (data) => token(data.token) && data.revision === 0
  );
  if (!result || fingerprint(owner) !== serialized) return undefined;
  const context = { owner, fingerprint: serialized, token: result.token, revision: 0 };
  contexts.set(session, context);
  return context;
}

/** Apply the native ordered state transition while retaining every public pending-entry object. */
export async function transitionRustUnmergedState(owner: Pending, action: Action): Promise<boolean | undefined> {
  if (!isRustSnapshotOperation()) return undefined;
  if (
    !action ||
    Object.getPrototypeOf(action) !== Object.prototype ||
    Object.values(Object.getOwnPropertyDescriptors(action)).some((descriptor) => descriptor.get || descriptor.set) ||
    !['add', 'remove', 'removeAll'].includes(action.kind) ||
    (action.kind !== 'add' && !jsonData(action)) ||
    (action.kind === 'remove' &&
      (!Array.isArray(action.ids) ||
        action.ids.length > MAX_ENTRIES ||
        !action.ids.every(
          (id) => id && typeof id.name === 'string' && (id.scope === undefined || typeof id.scope === 'string')
        )))
  )
    return undefined;
  const serialized = fingerprint(owner);
  if (serialized === undefined || (action.kind === 'add' && !ordinaryEntry(action.entry))) return undefined;
  const projectedAction = action.kind === 'add' ? { kind: 'add', entry: newPendingEntry(action.entry) } : action;
  const actionSnapshot = JSON.stringify(projectedAction);
  const removed = new Set<number>();
  if (action.kind === 'remove') {
    for (const id of action.ids) {
      const index = owner.unmerged.findIndex((entry) => entry.id.name === id.name && entry.id.scope === id.scope);
      if (index >= 0) removed.add(index);
    }
  }
  const expectedIndices = owner.unmerged
    .map((_, index) => index)
    .filter((index) => action.kind !== 'removeAll' && !removed.has(index));
  const expectedChanged = action.kind === 'add' || action.kind === 'removeAll' || removed.size > 0;
  return withWorkspaceSession(async (session) => {
    const context = await initialize(session, owner, serialized);
    if (!context) return undefined;
    const result = await request(
      session,
      { kind: 'transition', token: context.token, revision: context.revision, action: projectedAction },
      (data) =>
        token(data.token) &&
        data.revision === context.revision + 1 &&
        typeof data.changed === 'boolean' &&
        Array.isArray(data.indices) &&
        data.indices.every((index) => Number.isInteger(index) && index >= 0 && index < owner.unmerged.length) &&
        new Set(data.indices).size === data.indices.length &&
        data.indices.every((index, offset) => offset === 0 || index > data.indices[offset - 1]) &&
        (data.added === undefined || typeof data.added === 'boolean') &&
        data.changed === expectedChanged &&
        Boolean(data.added) === (action.kind === 'add') &&
        JSON.stringify(data.indices) === JSON.stringify(expectedIndices)
    );
    if (
      !result ||
      fingerprint(owner) !== serialized ||
      (action.kind === 'add'
        ? !ordinaryEntry(action.entry) ||
          JSON.stringify({ kind: 'add', entry: newPendingEntry(action.entry) }) !== actionSnapshot
        : !jsonData(action) || JSON.stringify(action) !== actionSnapshot)
    ) {
      contexts.delete(session);
      return undefined;
    }
    if (action.kind === 'add') {
      owner.unmerged.push(action.entry);
    } else {
      if (result.changed) owner.unmerged = result.indices.map((index) => owner.unmerged[index]);
    }
    if (result.changed) owner.hasChanged = true;
    const next = fingerprint(owner);
    if (next === undefined) {
      contexts.delete(session);
      return result.changed;
    }
    contexts.set(session, { owner, fingerprint: next, token: result.token, revision: result.revision });
    return result.changed;
  });
}
function newPendingEntry(entry: any): any {
  return {
    ...entry,
    head: entry.head.toString(),
    laneId: entry.laneId.toObject(),
    unrelated:
      entry.unrelated === undefined || typeof entry.unrelated === 'boolean'
        ? entry.unrelated
        : {
            unrelatedHead: entry.unrelated.unrelatedHead.toString(),
            unrelatedLaneId: entry.unrelated.unrelatedLaneId.toObject(),
            headOnCurrentLane: entry.unrelated.headOnCurrentLane.toString(),
          },
  };
}

/** Commit exact canonical JSON only after native state and live adapter state agree. */
export async function persistRustUnmergedState(owner: Pending): Promise<boolean> {
  if (!isRustSnapshotOperation()) return false;
  const serialized = fingerprint(owner);
  if (serialized === undefined) return false;
  const filePath = owner.filePath;
  return Boolean(
    await withWorkspaceSession(async (session) => {
      const context = await initialize(session, owner, serialized);
      if (!context || owner.filePath !== filePath || fingerprint(owner) !== serialized) return false;
      const contents = JSON.stringify(owner.toObject(), null, 2);
      const result = await request(
        session,
        { kind: 'commit', token: context.token, revision: context.revision, path: filePath, contents },
        (data) => data.saved === true
      );
      if (!result) return false;
      // A completed write is authoritative; replaying after a later live mutation could write a different path.
      if (owner.filePath !== filePath || fingerprint(owner) !== serialized) contexts.delete(session);
      return true;
    })
  );
}
