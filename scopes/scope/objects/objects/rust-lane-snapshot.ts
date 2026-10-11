import { ExtensionDataList } from '@teambit/legacy.extension-data';
import { isTag } from '@teambit/component-version';
import { isDeepStrictEqual } from 'util';
import { ComponentID } from '@teambit/component-id';
import { withWorkspaceSession } from '@teambit/component.sources';
import type ModelComponent from '../models/model-component';
import type { AddVersionOpts } from '../models/model-component';
import type Version from '../models/version';
import type Lane from '../models/lane';
import Ref from './ref';
import { LaneId } from '@teambit/lane-id';
import type { UnmergedComponent } from '@teambit/legacy.scope';
import type { Log } from '../models/version';
import { isRustSnapshotOperation } from './rust-snapshot';

const MAX_BYTES = 4 * 1024 * 1024;
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
type Constructor = { prototype: any };
// Registration can run while the cyclic models module is still initializing.
// eslint-disable-next-line no-var
var registered: Map<Constructor, Map<string, PropertyDescriptor | undefined>> | undefined;
function modelMethodNames(): string[] {
  return [
    'toBuffer',
    'toObject',
    'id',
    'hash',
    'addVersion',
    'toComponentId',
    'getRef',
    'getHead',
    'addAsOnlyParent',
    'isRemoved',
    'getComponent',
    'findUpdateDependent',
    'removeComponent',
    'addComponentToUpdateDependents',
    'setOverrideUpdateDependents',
    'removeComponentFromUpdateDependentsIfExist',
    'addComponent',
    'setReadmeComponent',
    'isLegacy',
    'setUnrelated',
    'setSquashed',
    'addModifiedLog',
    'addParent',
    'hasParent',
  ];
}
function descriptor(object: object, name: string): PropertyDescriptor | undefined {
  let owner: object | null = object;
  while (owner) {
    const found = Object.getOwnPropertyDescriptor(owner, name);
    if (found) return found;
    owner = Object.getPrototypeOf(owner);
  }
  return undefined;
}
export function registerRustLaneSnapshotModels(models: Record<string, Constructor | undefined>): void {
  registered ||= new Map();
  for (const model of Object.values(models)) {
    if (model && !registered.has(model))
      registered.set(model, new Map(modelMethodNames().map((name) => [name, descriptor(model.prototype, name)])));
  }
}
function ordinary(object: object, methods: string[]): boolean {
  const entry =
    registered && [...registered.entries()].find(([model]) => Object.getPrototypeOf(object) === model.prototype);
  return Boolean(
    entry &&
      methods.every((name) => {
        const expected = entry[1].get(name);
        const actual = descriptor(object, name);
        return (
          actual &&
          expected &&
          actual.value === expected.value &&
          actual.get === expected.get &&
          actual.set === expected.set
        );
      })
  );
}
const defaultRefFrom = Ref.from;
const defaultComponentFromObject = ComponentID.fromObject;
const defaultFindCoreExtension = ExtensionDataList.prototype.findCoreExtension;
const arrayMethods = ['map', 'every', 'find', 'filter', 'push', 'includes'];
const extensionArrayDefaults = new Map(
  arrayMethods.map((name) => [name, descriptor(ExtensionDataList.prototype, name)])
);
const arrayDefaults = new Map(arrayMethods.map((name) => [name, descriptor(Array.prototype, name)]));
const refDefaults = new Map(['toString', 'isEqual'].map((name) => [name, descriptor(Ref.prototype, name)]));
function ordinaryRef(ref: Ref | null | undefined): boolean {
  if (!ref) return true;
  return (
    Object.getPrototypeOf(ref) === Ref.prototype &&
    hash(Object.getOwnPropertyDescriptor(ref, 'hash')?.value) &&
    [...refDefaults].every(([name, expected]) => descriptor(ref, name)?.value === expected?.value)
  );
}
const idMethods = ['isEqualWithoutVersion', 'changeVersion', 'hasVersion', 'toString', 'fullName', 'scope', 'version'];
const idDefaults = new Map(idMethods.map((name) => [name, descriptor(ComponentID.prototype, name)]));
function ordinaryId(id: ComponentID): boolean {
  return (
    Object.getPrototypeOf(id) === ComponentID.prototype &&
    [...idDefaults].every(
      ([name, expected]) =>
        descriptor(id, name)?.value === expected?.value &&
        descriptor(id, name)?.get === expected?.get &&
        descriptor(id, name)?.set === expected?.set
    )
  );
}

function ownData(object: object, seen = new Set<object>()): boolean {
  if (
    Array.isArray(object) &&
    [...(Object.getPrototypeOf(object) === ExtensionDataList.prototype ? extensionArrayDefaults : arrayDefaults)].some(
      ([name, expected]) => descriptor(object, name)?.value !== expected?.value
    )
  )
    return false;
  if (seen.has(object)) return true;
  seen.add(object);
  return Object.values(Object.getOwnPropertyDescriptors(object)).every(
    (entry) =>
      'value' in entry &&
      (!entry.value || typeof entry.value !== 'object' || Buffer.isBuffer(entry.value) || ownData(entry.value, seen))
  );
}

async function request(input: object): Promise<any | undefined> {
  const bytes = Buffer.from(JSON.stringify(input));
  if (bytes.length > MAX_BYTES) return undefined;
  return withWorkspaceSession(async (session) => {
    let output: any;
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
        if (failed && response.completed === 0 && response.data === undefined) return true;
        if (failed || response.completed !== 1 || !response.data || typeof response.data !== 'object') return false;
        output = response.data;
        return true;
      },
      MAX_BYTES
    );
    if (failed) await session.dispose();
    return output;
  });
}

function sameParent(
  previous: string | undefined,
  current: Ref | null | undefined,
  original: Ref | null | undefined
): boolean {
  return (
    ordinaryRef(current) &&
    current?.toString() === original?.toString() &&
    (!previous || !isTag(previous) || current === original)
  );
}

/** Rust decides lane parent and visible/hidden policy; canonical class mutations retain identities. */
export async function addRustLaneSnapshotVersion(
  component: ModelComponent,
  version: Version,
  versionToAdd: string,
  lane: Lane,
  previouslyUsedVersion?: string,
  options: AddVersionOpts = {}
): Promise<string | undefined> {
  if (!isRustSnapshotOperation() || !hash(versionToAdd)) return undefined;
  const eligible = () =>
    Ref.from === defaultRefFrom &&
    ComponentID.fromObject === defaultComponentFromObject &&
    ownData(component) &&
    ownData(version) &&
    descriptor(version.extensions, 'findCoreExtension')?.value === defaultFindCoreExtension &&
    ownData(lane) &&
    lane.components.every((entry) => ordinaryId(entry.id) && ordinaryRef(entry.head)) &&
    (!lane.updateDependents || lane.updateDependents.every(ordinaryId)) &&
    (!lane.readmeComponent || (ordinaryId(lane.readmeComponent.id) && ordinaryRef(lane.readmeComponent.head))) &&
    ordinary(component, ['toBuffer', 'id', 'toObject', 'addVersion', 'toComponentId', 'getRef', 'getHead']) &&
    ordinary(version, ['toBuffer', 'id', 'hash', 'addAsOnlyParent', 'isRemoved', 'isLegacy']) &&
    ordinary(lane, [
      'toBuffer',
      'toObject',
      'getComponent',
      'findUpdateDependent',
      'removeComponent',
      'addComponentToUpdateDependents',
      'setOverrideUpdateDependents',
      'removeComponentFromUpdateDependentsIfExist',
      'addComponent',
      'setReadmeComponent',
    ]) &&
    !Object.hasOwn(version, 'isLegacy');
  if (!eligible()) return undefined;
  const id = component.toComponentId();
  if (!ordinaryId(id)) return undefined;
  const parent = previouslyUsedVersion ? component.getRef(previouslyUsedVersion) : undefined;
  const head = component.getHead();
  if (!ordinaryRef(parent) || !ordinaryRef(head) || !ordinaryRef(version.hash())) return undefined;
  const projection = () => {
    const visible = lane.getComponent(id);
    return {
      kind: 'laneSnap',
      version: versionToAdd,
      versionHash: version.hash().toString(),
      isLegacy: version.isLegacy,
      parent: parent?.toString(),
      existingVisibleHead: visible?.head.toString(),
      modelHead: head?.toString(),
      existingHidden: Boolean(lane.findUpdateDependent(id)),
      explicitHidden: options.addToUpdateDependentsInLane,
      readmeSameName: lane.readmeComponent?.id.fullName === id.fullName,
      removed: version.isRemoved(),
      detachHead: Boolean(options.detachHead),
      overrideHead: Boolean(options.overrideHead),
    };
  };
  const input = projection();
  const buffers = () =>
    [component.toBuffer(false), version.toBuffer(false), lane.toBuffer(false)].map((buffer) => buffer.toString('hex'));
  const original = buffers();
  const result = await request(input);
  const liveParent = eligible() && previouslyUsedVersion ? component.getRef(previouslyUsedVersion) : undefined;
  const expectedHidden = input.explicitHidden ?? (input.existingHidden && !input.existingVisibleHead);
  const expectedParent = !input.isLegacy && input.parent !== input.version ? input.parent : undefined;
  if (
    !result ||
    !eligible() ||
    !ordinaryId(id) ||
    !ordinaryRef(parent) ||
    !ordinaryRef(head) ||
    !sameParent(previouslyUsedVersion, liveParent, parent) ||
    component.getHead() !== head ||
    JSON.stringify(projection()) !== JSON.stringify(input) ||
    JSON.stringify(buffers()) !== JSON.stringify(original) ||
    (input.detachHead && input.overrideHead) ||
    (!input.parent && (input.existingVisibleHead || input.modelHead)) ||
    result.parent !== expectedParent ||
    result.bucket !== (expectedHidden ? 'hidden' : 'visible') ||
    result.overrideUpdateDependents !== (expectedHidden && !input.existingHidden) ||
    result.updateReadme !== input.readmeSameName
  )
    return undefined;
  const ref = new Ref(versionToAdd);
  if (result.parent && parent) version.addAsOnlyParent(parent);
  if (result.bucket === 'hidden') {
    if (input.existingVisibleHead) lane.removeComponent(id);
    lane.addComponentToUpdateDependents(id.changeVersion(versionToAdd));
    if (result.overrideUpdateDependents) lane.setOverrideUpdateDependents(true);
  } else {
    if (input.existingHidden) lane.removeComponentFromUpdateDependentsIfExist(id);
    lane.addComponent({ id, head: ref, isDeleted: input.removed });
  }
  if (result.updateReadme) lane.setReadmeComponent(id);
  component.laneHeadLocal = ref;
  return versionToAdd;
}

const laneIdMethods = ['toObject', 'toString'];
const laneIdDefaults = new Map(laneIdMethods.map((name) => [name, descriptor(LaneId.prototype, name)]));
function ordinaryLaneId(id: LaneId): boolean {
  return (
    Object.getPrototypeOf(id) === LaneId.prototype &&
    ['name', 'scope'].every((name) => typeof Object.getOwnPropertyDescriptor(id, name)?.value === 'string') &&
    [...laneIdDefaults].every(
      ([name, expected]) =>
        descriptor(id, name)?.value === expected?.value &&
        descriptor(id, name)?.get === expected?.get &&
        descriptor(id, name)?.set === expected?.set
    )
  );
}

/** Plan pending merge ancestry before changing the Version or removing the pending entry. */
export async function reconcileRustMergeSnapshot(
  version: Version,
  entry: UnmergedComponent,
  previouslyUsedVersion: string | undefined,
  getSquashLog: (lane: LaneId) => Promise<Log>,
  getMergeMessage: (pending: UnmergedComponent) => string = (pending) => `merge ${pending.laneId.toString()}`
): Promise<boolean> {
  const eligible = () =>
    Ref.from === defaultRefFrom &&
    ownData(version) &&
    ownData(entry) &&
    isRustSnapshotOperation() &&
    ordinary(version, [
      'toBuffer',
      'isLegacy',
      'setUnrelated',
      'setSquashed',
      'addModifiedLog',
      'addParent',
      'hasParent',
      'addAsOnlyParent',
    ]) &&
    !Object.hasOwn(version, 'isLegacy') &&
    version.parents.every(ordinaryRef) &&
    ordinaryRef(entry.head) &&
    ordinaryLaneId(entry.laneId) &&
    (!entry.unrelated ||
      typeof entry.unrelated === 'boolean' ||
      (ordinaryRef(entry.unrelated.unrelatedHead) &&
        ordinaryRef(entry.unrelated.headOnCurrentLane) &&
        ordinaryLaneId(entry.unrelated.unrelatedLaneId)));
  if (
    !eligible() ||
    (entry.unrelated && !previouslyUsedVersion) ||
    (!entry.unrelated && entry.shouldSquash && !version.parents[0])
  )
    return false;
  const projection = () => ({
    kind: 'reconcileSnap',
    isLegacy: version.isLegacy,
    currentParents: version.parents.map((parent) => parent.toString()),
    currentMessage: version.log.message,
    previouslyUsedVersion,
    entry: {
      head: entry.head.toString(),
      lane: entry.laneId.toObject(),
      unrelated:
        entry.unrelated && typeof entry.unrelated !== 'boolean'
          ? {
              unrelatedHead: entry.unrelated.unrelatedHead.toString(),
              unrelatedLane: entry.unrelated.unrelatedLaneId.toObject(),
              headOnCurrentLane: entry.unrelated.headOnCurrentLane.toString(),
            }
          : entry.unrelated,
      shouldSquash: entry.shouldSquash,
    },
  });
  const input = projection();
  const initialVersion = version.toBuffer(false).toString('hex');
  const parents = [...version.parents];
  const head = entry.head;
  const lane = entry.laneId;
  const unrelated = entry.unrelated;
  const result = await request(input);
  const mode = input.entry.unrelated ? 'unrelated' : input.entry.shouldSquash ? 'squashed' : 'merge';
  let expectedParents = input.currentParents;
  if (!input.isLegacy && mode === 'unrelated')
    expectedParents = [
      typeof input.entry.unrelated === 'object' ? input.entry.unrelated.headOnCurrentLane : input.entry.head,
    ];
  if (!input.isLegacy && mode === 'merge' && !expectedParents.includes(input.entry.head))
    expectedParents = [...expectedParents, input.entry.head];
  const expectedUnrelated =
    mode === 'unrelated'
      ? {
          head: typeof input.entry.unrelated === 'object' ? input.entry.unrelated.unrelatedHead : previouslyUsedVersion,
          lane: typeof input.entry.unrelated === 'object' ? input.entry.unrelated.unrelatedLane : input.entry.lane,
        }
      : undefined;
  const expectedSquashed =
    mode === 'squashed'
      ? { previousParents: [input.currentParents[0], input.entry.head], lane: input.entry.lane }
      : undefined;
  if (
    !result ||
    !eligible() ||
    entry.head !== head ||
    entry.laneId !== lane ||
    entry.unrelated !== unrelated ||
    version.parents.length !== parents.length ||
    !parents.every((parent, index) => version.parents[index] === parent) ||
    JSON.stringify(projection()) !== JSON.stringify(input) ||
    version.toBuffer(false).toString('hex') !== initialVersion ||
    result.mode !== mode ||
    JSON.stringify(result.parents) !== JSON.stringify(expectedParents) ||
    !isDeepStrictEqual(result.unrelated, expectedUnrelated) ||
    !isDeepStrictEqual(result.squashed, expectedSquashed) ||
    result.setMergeMessage !== (mode !== 'unrelated' && !input.currentMessage)
  )
    return false;
  if (mode === 'unrelated') {
    if (unrelated && typeof unrelated === 'object') {
      version.setUnrelated({ head: unrelated.unrelatedHead, laneId: unrelated.unrelatedLaneId });
      version.addAsOnlyParent(unrelated.headOnCurrentLane);
    } else {
      version.setUnrelated({ head: Ref.from(previouslyUsedVersion as string), laneId: lane });
      version.addAsOnlyParent(head);
    }
  } else if (mode === 'squashed') {
    // Capture the original parent before awaiting the same public log hook as canonical snapping.
    const previousParents = [parents[0], head];
    const log = await getSquashLog(lane);
    version.setSquashed({ previousParents, laneId: entry.laneId }, log);
    version.log.message = version.log.message || getMergeMessage(entry);
  } else {
    version.addParent(head);
    version.log.message = version.log.message || getMergeMessage(entry);
  }
  return true;
}
