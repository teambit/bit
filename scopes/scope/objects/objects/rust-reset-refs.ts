import { AsyncLocalStorage } from 'async_hooks';
import { types } from 'util';
import type { ComponentID } from '@teambit/component-id';
import type ModelComponent from '../models/model-component';
import type Lane from '../models/lane';
import type Version from '../models/version';
import type Repository from './repository';
import type Ref from './ref';
import { hasCanonicalRefMethods } from './ref';
import { isRustSnapshotOperation } from './rust-snapshot';
import { requestRustRecovery } from './rust-lane-recovery';
import { canReadCacheNatively } from '@teambit/harmony.modules.in-memory-cache';
import { canReadLiveObjectsNatively } from './live-objects';

type Registered = {
  constructor: any;
  owners: Array<{ owner: object; descriptors: PropertyDescriptorMap }>;
  statics: PropertyDescriptorMap;
};
// eslint-disable-next-line no-var
var defaults: Map<string, Registered> | undefined;
// eslint-disable-next-line no-var
var repositoryHooks: Map<any, Record<string, PropertyDescriptor | undefined>> | undefined;
const versionIdAliases = new WeakMap<object, ComponentID>();
const historyResetRefPlans = new AsyncLocalStorage<boolean>();
const isProxy = types.isProxy;

/** Keep reset's ref planning on its operation protocol without changing other callers. */
export function withRustHistoryResetRefPlan<T>(action: () => Promise<T>): Promise<T> {
  return historyResetRefPlans.run(true, action);
}
function resetPlanKind(): 'historyResetComponentPlan' | 'resetRefsPlan' {
  return historyResetRefPlans.getStore() ? 'historyResetComponentPlan' : 'resetRefsPlan';
}
function hookNames(): string[] {
  return [
    'onPostObjectsPersist',
    'onPreObjectPersist',
    'hasPreObjectPersistTransformer',
    'onPostObjectRead',
    'hasPostObjectReadTransformer',
  ];
}
export function registerRustResetRepositoryHooks(constructor: any): void {
  repositoryHooks ||= new Map();
  repositoryHooks.set(
    constructor,
    Object.fromEntries(hookNames().map((name) => [name, Object.getOwnPropertyDescriptor(constructor, name)]))
  );
}
export function registerRustResetClass(name: string, constructor: any): void {
  defaults ||= new Map();
  if (!constructor || defaults.has(name)) return;
  const owners: Registered['owners'] = [];
  let owner = constructor.prototype;
  while (owner && owner !== Object.prototype) {
    owners.push({ owner, descriptors: Object.getOwnPropertyDescriptors(owner) });
    owner = Object.getPrototypeOf(owner);
  }
  defaults.set(name, { constructor, owners, statics: Object.getOwnPropertyDescriptors(constructor) });
  if (name === 'Repository') registerRustResetRepositoryHooks(constructor);
}
function sameDescriptors(owner: object, expected: PropertyDescriptorMap, omitted: string[] = []): boolean {
  const actual = Object.getOwnPropertyDescriptors(owner);
  const keys = (value: object) =>
    Reflect.ownKeys(value).filter((key) => typeof key !== 'string' || !omitted.includes(key));
  return (
    keys(actual).length === keys(expected).length &&
    keys(expected).every((key) => {
      const before = (expected as any)[key],
        after = (actual as any)[key];
      return (
        after &&
        before.value === after.value &&
        before.get === after.get &&
        before.set === after.set &&
        before.writable === after.writable &&
        before.enumerable === after.enumerable &&
        before.configurable === after.configurable
      );
    })
  );
}
function ordinary(value: any, name: string): boolean {
  const entry = defaults?.get(name);
  if (
    !entry ||
    !value ||
    Object.getPrototypeOf(value) !== entry.constructor.prototype ||
    !sameDescriptors(entry.constructor, entry.statics, name === 'Repository' ? hookNames() : [])
  )
    return false;
  for (const captured of entry.owners) {
    if (!sameDescriptors(captured.owner, captured.descriptors)) return false;
    for (const key of Reflect.ownKeys(captured.descriptors)) {
      if (!(name === 'Array' && key === 'length') && Object.getOwnPropertyDescriptor(value, key)) {
        if (!(name === 'Version' && key === 'id' && hasVersionIdAlias(value))) return false;
      }
    }
  }
  return Reflect.ownKeys(value).every((key) => 'value' in Object.getOwnPropertyDescriptor(value, key)!);
}
function array(value: any): value is any[] {
  if (!ordinary(value, 'Array') || value.length > 4096 || Object.getOwnPropertySymbols(value).length) return false;
  const properties = Object.getOwnPropertyDescriptors(value);
  return (
    Object.keys(properties).length === value.length + 1 &&
    Object.keys(properties).every(
      (key) => key === 'length' || (/^(0|[1-9][0-9]*)$/.test(key) && Number(key) < value.length)
    )
  );
}
function hash(ref: Ref | undefined | null): string | undefined {
  if (!ref || !hasCanonicalRefMethods(ref)) return undefined;
  const value = Object.getOwnPropertyDescriptor(ref, 'hash')?.value;
  return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value) ? value : undefined;
}
function refs(values: Ref[]): string[] | undefined {
  if (!array(values)) return undefined;
  const result = values.map(hash);
  return result.every((value) => value !== undefined) ? (result as string[]) : undefined;
}
function mapRefs(value: any): Array<{ label: string; hash: string }> | undefined {
  if (
    !value ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).length > 4096
  )
    return undefined;
  const result: Array<{ label: string; hash: string }> = [];
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') return undefined;
    const property = Object.getOwnPropertyDescriptor(value, key)!;
    if (!('value' in property) || !property.enumerable) return undefined;
    const ref = hash(property.value);
    if (!ref) return undefined;
    result.push({ label: key, hash: ref });
  }
  return result;
}
function repositoryEligible(repository: Repository): boolean {
  if (!ordinary(repository, 'Repository')) return false;
  const registered = defaults?.get('Repository');
  const expected = registered && repositoryHooks?.get(registered.constructor);
  if (
    !expected ||
    !canReadCacheNatively((repository as any).cache) ||
    !canReadLiveObjectsNatively((repository as any).liveObjects)
  )
    return false;
  for (const name of hookNames()) {
    const before = (expected as any)[name];
    const after = Object.getOwnPropertyDescriptor(registered!.constructor, name);
    if (before ? !after || !Object.keys(before).every((key) => before[key] === after[key]) : after) return false;
  }
  const objects = Object.getOwnPropertyDescriptor(repository, 'objects')?.value;
  if (!objects || ![Object.prototype, null].includes(Object.getPrototypeOf(objects))) return false;
  return Reflect.ownKeys(objects).every((key) => 'value' in Object.getOwnPropertyDescriptor(objects, key)!);
}
function ordinaryId(id: any): boolean {
  return ordinary(id, 'ComponentID') && ordinary(Object.getOwnPropertyDescriptor(id, '_legacy')?.value, 'BitId');
}
function hasVersionIdAlias(version: object): boolean {
  const alias = versionIdAliases.get(version);
  const field = Object.getOwnPropertyDescriptor(version, 'id');
  return Boolean(
    alias &&
      field &&
      'value' in field &&
      field.value === alias &&
      field.writable &&
      field.enumerable &&
      field.configurable &&
      ordinaryId(alias)
  );
}

/** Record only the exact data alias about to be assigned by the canonical dependency loader. */
export function noteRustResetVersionId(version: Version, id: ComponentID): void {
  if (
    !isRustSnapshotOperation() ||
    !version ||
    typeof version !== 'object' ||
    isProxy(version) ||
    !id ||
    typeof id !== 'object' ||
    isProxy(id) ||
    isProxy(Object.getOwnPropertyDescriptor(id, '_legacy')?.value ?? {}) ||
    !ordinaryId(id)
  )
    return;
  const fields: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(version);
  const previous = fields.id;
  if (previous && (!('value' in previous) || !previous.writable || !previous.enumerable || !previous.configurable))
    return;
  // Earlier graph loads may already have replaced this method. Validate every other defining
  // method and data field without changing the live instance or blessing another shadow.
  delete fields.id;
  const metadata = Object.create(Object.getPrototypeOf(version), fields);
  if (ordinary(metadata, 'Version')) versionIdAliases.set(version, id);
}
function laneEligible(lane: Lane | undefined): boolean {
  if (!lane) return true;
  if (!ordinary(lane, 'Lane') || !array(lane.components)) return false;
  for (const entry of lane.components) {
    if (
      !entry ||
      Reflect.ownKeys(entry).some((key) => !('value' in Object.getOwnPropertyDescriptor(entry, key)!)) ||
      !ordinaryId(entry.id) ||
      !hash(entry.head)
    )
      return false;
  }
  return !lane.updateDependents || (array(lane.updateDependents) && lane.updateDependents.every(ordinaryId));
}
function canonicalParser(): boolean {
  const version = defaults?.get('Version'),
    object = defaults?.get('BitObject');
  if (
    !version ||
    !object ||
    !sameDescriptors(version.constructor, version.statics) ||
    !sameDescriptors(object.constructor, object.statics)
  )
    return false;
  const { typesObj } = require('@teambit/legacy.scope');
  return typesObj && Object.getOwnPropertyDescriptor(typesObj, 'Version')?.value === version.constructor;
}
export type RustResetContext = {
  componentHadHead: boolean;
  compId: ComponentID;
  visibleLaneItem?: { head: Ref };
  laneItemHead?: Ref;
  isHiddenLaneEntry: boolean;
};
type Selection = { common: true } | { parent: { versionIndex: number; parentIndex: number } };
export type RustResetPlan = {
  changeHead: boolean;
  changeLaneHead: boolean;
  removeLane: boolean;
  keepComponent: boolean;
  detachedRetained: number[];
  clearDetachedCurrent: boolean;
  newHead?: Selection;
};
export async function planRustResetRefs(
  source: object,
  component: ModelComponent,
  versionsRefs: Ref[],
  versions: string[],
  repository: Repository,
  context: RustResetContext,
  lane?: Lane,
  removeOnlyHead = false
): Promise<{ plan: RustResetPlan; newHead?: Ref } | undefined> {
  const ineligible = () =>
    !isRustSnapshotOperation() ||
    !ordinary(source, 'Sources') ||
    !ordinary(component, 'ModelComponent') ||
    !repositoryEligible(repository) ||
    !ordinary(component.detachedHeads, 'DetachedHeads') ||
    !laneEligible(lane) ||
    !ordinaryId(context.compId) ||
    !array(versions);
  if (ineligible()) return undefined;
  const deletedRefs = refs(versionsRefs),
    tags = mapRefs(component.versions),
    orphaned = mapRefs(component.orphanedVersions);
  const detached = component.detachedHeads as any;
  const detachedHeads = refs(detached.heads);
  if (!deletedRefs || !tags || !orphaned || !detachedHeads || !versions.every((value) => typeof value === 'string'))
    return undefined;
  const head = hash(component.head),
    laneHead = hash(context.laneItemHead);
  if ((component.head && !head) || (context.laneItemHead && !laneHead)) return undefined;
  const needsHead = Boolean((head && deletedRefs.includes(head)) || (laneHead && deletedRefs.includes(laneHead)));
  const divergence = Object.getOwnPropertyDescriptor(component, 'divergeData')?.value;
  const commonRef = divergence && Object.getOwnPropertyDescriptor(divergence, 'commonSnapBeforeDiverge')?.value;
  const common = hash(commonRef);
  if (needsHead && !removeOnlyHead && (!divergence || (commonRef && !common))) return undefined;
  const ordered = versions.map((label) => ({ label, hash: hash(component.getRef(label)) }));
  if (ordered.some((entry) => !entry.hash)) return undefined;
  const input: any = {
    kind: resetPlanKind(),
    objectsDirectory: repository.getPath(),
    versions: ordered,
    deletedRefs,
    removeOnlyHead,
    laneHidden: context.isHiddenLaneEntry,
    laneNew: Boolean(lane?.isNew),
    hasScope: Boolean(component.scope),
    tags,
    orphaned,
    detachedHeads,
    ...(head ? { head } : {}),
    ...(laneHead ? { laneHead } : {}),
    ...(common ? { common } : {}),
  };
  const captureOptionalRefs = () => {
    for (const [field, ref] of [
      ['laneHeadRemote', component.laneHeadRemote],
      ['laneHeadLocal', component.laneHeadLocal],
      ['detachedCurrent', detached.current],
    ] as const) {
      if (ref && !hash(ref)) return false;
      if (ref) input[field] = hash(ref);
    }
    return true;
  };
  if (!captureOptionalRefs()) return undefined;
  const idSnapshot = JSON.stringify(Object.getOwnPropertyDescriptors((context.compId as any)._legacy));
  const laneSnapshot = lane && JSON.stringify({ components: lane.components, updateDependents: lane.updateDependents });
  const initialHead = component.head,
    initialLaneHead = component.laneHeadLocal;
  const savedScope = component.scope,
    savedName = component.name;
  const savedLabels = versions.slice();
  const savedDetached = { owner: component.detachedHeads, heads: detached.heads, current: detached.current };
  const savedLane = lane && {
    components: lane.components,
    updateDependents: lane.updateDependents,
    head: context.visibleLaneItem?.head,
    hidden: context.isHiddenLaneEntry ? lane.updateDependents?.slice() : undefined,
  };
  const tagRefs = component.versions,
    orphanedRefs = component.orphanedVersions;
  const tagObjects = Object.entries(component.versions),
    orphanedObjects = Object.entries(component.orphanedVersions);
  const labelRefs = ordered.map(({ label }) => component.getRef(label));
  if (versionObjectsNeeded(input) && (!canonicalParser() || !repository.canPlanCheckoutNatively(labelRefs as Ref[])))
    return undefined;
  const loadVersions = async (): Promise<Version[] | undefined> => {
    const loaded: Version[] = versionObjectsNeeded(input)
      ? await Promise.all(versions.map((label) => component.loadVersion(label, repository))).catch(() => [])
      : [];
    if (versionObjectsNeeded(input) && loaded.length !== versions.length) return undefined;
    for (let index = 0; index < loaded.length; index += 1) {
      const version = loaded[index];
      if (!ordinary(version, 'Version')) return undefined;
      const parents = refs(version.parents);
      if (!parents || hash(version.hash()) !== ordered[index].hash) return undefined;
      input.versions[index].parents = parents;
      input.versions[index].commonParentIndices = version.parents.flatMap((ref, parentIndex) =>
        ref === commonRef ? [parentIndex] : []
      );
    }
    return loaded;
  };
  const versionObjects = await loadVersions();
  if (!versionObjects) return undefined;
  const parentArrays = versionObjects.map((version) => ({ array: version.parents, refs: version.parents.slice() }));
  const validatePlan = (data: RustResetPlan): boolean => {
    if (
      typeof data.changeHead !== 'boolean' ||
      typeof data.changeLaneHead !== 'boolean' ||
      typeof data.removeLane !== 'boolean' ||
      typeof data.keepComponent !== 'boolean' ||
      typeof data.clearDetachedCurrent !== 'boolean' ||
      !Array.isArray(data.detachedRetained) ||
      !data.detachedRetained.every(
        (index: any) => Number.isInteger(index) && index >= 0 && index < detachedHeads.length
      ) ||
      new Set(data.detachedRetained).size !== data.detachedRetained.length
    )
      return false;
    if (
      data.changeHead !== Boolean(head && deletedRefs.includes(head)) ||
      data.changeLaneHead !== Boolean(laneHead && deletedRefs.includes(laneHead))
    )
      return false;
    if (!data.newHead) return true;
    if ('common' in data.newHead) return data.newHead.common === true && Boolean(commonRef);
    const parent = data.newHead.parent;
    return (
      parent &&
      Number.isInteger(parent.versionIndex) &&
      Number.isInteger(parent.parentIndex) &&
      parent.versionIndex >= 0 &&
      parent.versionIndex < versionObjects.length &&
      parent.parentIndex >= 0 &&
      parent.parentIndex < versionObjects[parent.versionIndex].parents.length
    );
  };
  const defaultsChanged = () =>
    !ordinary(source, 'Sources') ||
    !ordinary(component, 'ModelComponent') ||
    !repositoryEligible(repository) ||
    !laneEligible(lane) ||
    (versionObjectsNeeded(input) && (!canonicalParser() || !repository.canPlanCheckoutNatively(labelRefs as Ref[]))) ||
    component.head !== initialHead ||
    component.laneHeadLocal !== initialLaneHead ||
    hash(component.head) !== head ||
    hash(context.laneItemHead) !== laneHead ||
    component.versions !== tagRefs ||
    component.orphanedVersions !== orphanedRefs ||
    component.scope !== savedScope ||
    component.name !== savedName ||
    tagObjects.some(([key, ref]) => Object.getOwnPropertyDescriptor(component.versions, key)?.value !== ref) ||
    orphanedObjects.some(
      ([key, ref]) => Object.getOwnPropertyDescriptor(component.orphanedVersions, key)?.value !== ref
    );
  const identityChanged = () =>
    component.detachedHeads !== savedDetached.owner ||
    detached.heads !== savedDetached.heads ||
    detached.current !== savedDetached.current ||
    hash(detached.current) !== input.detachedCurrent ||
    hash(component.laneHeadRemote) !== input.laneHeadRemote ||
    hash(component.laneHeadLocal) !== input.laneHeadLocal ||
    Boolean(component.scope) !== input.hasScope ||
    Boolean(lane?.isNew) !== input.laneNew ||
    Object.getOwnPropertyDescriptor(component, 'divergeData')?.value !== divergence ||
    (divergence && Object.getOwnPropertyDescriptor(divergence, 'commonSnapBeforeDiverge')?.value) !== commonRef ||
    hash(commonRef) !== common ||
    JSON.stringify(versions) !== JSON.stringify(savedLabels) ||
    (lane &&
      savedLane &&
      (lane.components !== savedLane.components ||
        lane.updateDependents !== savedLane.updateDependents ||
        context.visibleLaneItem?.head !== savedLane.head ||
        (context.visibleLaneItem && lane.getComponent(context.compId) !== context.visibleLaneItem) ||
        (savedLane.hidden && savedLane.hidden.some((id, index) => lane.updateDependents?.[index] !== id))));
  const contentsChanged = () =>
    repository.getPath() !== input.objectsDirectory ||
    !ordinaryId(context.compId) ||
    JSON.stringify(Object.getOwnPropertyDescriptors((context.compId as any)._legacy)) !== idSnapshot ||
    (lane &&
      JSON.stringify({ components: lane.components, updateDependents: lane.updateDependents }) !== laneSnapshot) ||
    JSON.stringify(mapRefs(component.versions)) !== JSON.stringify(tags) ||
    JSON.stringify(mapRefs(component.orphanedVersions)) !== JSON.stringify(orphaned) ||
    JSON.stringify(refs(versionsRefs)) !== JSON.stringify(deletedRefs) ||
    JSON.stringify(refs(detached.heads)) !== JSON.stringify(detachedHeads) ||
    parentArrays.some(
      (saved, index) =>
        !ordinary(versionObjects[index], 'Version') ||
        saved.array !== versionObjects[index].parents ||
        JSON.stringify(refs(versionObjects[index].parents)) !== JSON.stringify(input.versions[index].parents) ||
        saved.refs.some((ref, parentIndex) => ref !== versionObjects[index].parents[parentIndex])
    );
  const result = await requestRustRecovery<RustResetPlan>(input, validatePlan);
  if (!result || defaultsChanged() || identityChanged() || contentsChanged()) return undefined;
  const newHead =
    result.newHead &&
    ('common' in result.newHead
      ? commonRef
      : versionObjects[result.newHead.parent.versionIndex].parents[result.newHead.parent.parentIndex]);
  if (result.changeLaneHead && newHead && !divergence) return undefined;
  return { plan: result, newHead };
}
function versionObjectsNeeded(input: any): boolean {
  return Boolean(
    ((input.head && input.deletedRefs.includes(input.head)) ||
      (input.laneHead && input.deletedRefs.includes(input.laneHead))) &&
      (input.removeOnlyHead || !input.common)
  );
}
