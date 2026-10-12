import { AsyncLocalStorage } from 'async_hooks';
import { types } from 'util';
import { getDivergeData } from '@teambit/component.snap-distance';
import { pMapPool } from '@teambit/toolbox.promise.map-pool';
import { concurrentComponentsLimit } from '@teambit/harmony.modules.concurrency';
import {
  withRustSnapshotTransaction,
  requestRustSnapshotTransaction,
  retireRustSnapshotTransaction,
  hasRustSnapshotTransactionClass,
  hasRustSnapshotTransactionClassFields,
  snapshotPolicyId,
  hasRustSnapshotFunctions,
  hasRustSnapshotFunctionReference,
  withRustHistoryResetRefPlan,
  type ModelComponent,
  type Repository,
  type Ref,
  type Lane,
  type Version,
} from '@teambit/objects';
import { withWorkspacePersistence, withRustWorkspaceEngine, isRustWorkspaceEngine } from '@teambit/component.sources';
import { canRecoverBitmapNatively, type BitMap, type ComponentMap } from '@teambit/legacy.bit-map';
import type { ComponentID, ComponentIdList } from '@teambit/component-id';
import { DependencyGraph } from '@teambit/legacy.dependency-graph';
import type { Scope } from '@teambit/legacy.scope';

export type HistoryResetOptions = {
  mode: 'real' | 'soft' | 'neverExported';
  pattern: boolean;
  head: boolean;
  force: boolean;
};
type State = { token: string; revision: number; directive: { phase: string; count: number } };
type Owner = { options: HistoryResetOptions; state?: State; closing?: boolean };
const isProxy = types.isProxy;
const owners = new AsyncLocalStorage<Owner>();
const childOwners = new AsyncLocalStorage<{ state?: State }>();
const childPhases = [
  'model',
  'bitmap',
  'laneHeads',
  'localVersions',
  'headGuard',
  'dependents',
  'batchIds',
  'removeRefs',
  'result',
  'done',
];
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

function metadata(value: unknown, seen = new Set<object>(), depth = 0): boolean {
  if (depth > 64) return false;
  if (value === null || value === undefined || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || isProxy(value) || seen.has(value) || Object.getOwnPropertySymbols(value).length)
    return false;
  const array = Array.isArray(value);
  if (
    array
      ? Object.getPrototypeOf(value) !== Array.prototype
      : ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    return false;
  const fields = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(fields);
  if (keys.length > 4097 || (array && keys.length !== value.length + 1)) return false;
  seen.add(value);
  const valid = keys.every((key) => {
    if (array && key === 'length') return true;
    const field = fields[key];
    return (
      'value' in field &&
      field.enumerable &&
      (!array || (/^(0|[1-9][0-9]*)$/.test(key) && Number(key) < value.length && field.value !== undefined)) &&
      metadata(field.value, seen, depth + 1)
    );
  });
  seen.delete(value);
  return valid;
}

export function isRustHistoryResetOperation(): boolean {
  const owner = owners.getStore();
  return Boolean(owner && !owner.closing && isRustWorkspaceEngine());
}

/** The existing snapshot transport shares this operation's physical request broker. */
export function requestRustHistoryReset<T>(input: object, validate: (value: any) => boolean): Promise<T | undefined> {
  if (!isRustHistoryResetOperation() || !metadata(input)) return Promise.resolve(undefined);
  return requestRustSnapshotTransaction<T>(input, validate);
}

function phases(options: HistoryResetOptions): string[] {
  if (options.mode === 'neverExported') return ['ids', 'deleteObjects', 'updateBitmap', 'writeBitmap', 'done'];
  if (options.mode === 'soft')
    return [
      'captureLane',
      'softCandidates',
      ...(options.pattern ? ['softPattern'] : []),
      'softApply',
      'markBitmap',
      'destroy',
      'done',
    ];
  return [
    'captureLane',
    'candidates',
    ...(options.pattern ? ['pattern'] : []),
    ...(options.pattern && !options.force && options.head ? ['batchGuard'] : []),
    'components',
    'laneHistory',
    'persist',
    'bitmap',
    'stagedWrite',
    'destroy',
    'done',
  ];
}

function state(value: any, options: HistoryResetOptions): value is State {
  return Boolean(
    value &&
      hash(value.token) &&
      Number.isSafeInteger(value.revision) &&
      value.revision >= 0 &&
      value.directive &&
      phases(options).includes(value.directive.phase) &&
      Number.isSafeInteger(value.directive.count) &&
      value.directive.count >= 0 &&
      value.directive.count <= 4096
  );
}

/** Public effects remain in their canonical phases, including concurrent children and failure prefixes. */
export function withRustHistoryResetOperation<T>(options: HistoryResetOptions, action: () => Promise<T>): Promise<T> {
  if (process.env.BIT_RUST_CLIENT_VCS !== 'on' || owners.getStore()) return action();
  return withWorkspacePersistence(() =>
    withRustWorkspaceEngine(() =>
      withRustSnapshotTransaction(() => {
        const owner: Owner = { options: { ...options } };
        return owners.run(owner, async () => {
          owner.state = await requestRustHistoryReset<State>(
            { kind: 'historyResetBegin', ...owner.options },
            (value) =>
              state(value, owner.options) && value.revision === 0 && value.directive.phase === phases(owner.options)[0]
          );
          try {
            return await action();
          } finally {
            // Promise.all rejection leaves siblings running; stop new token work before releasing their parent.
            owner.closing = true;
            if (owner.state && isRustWorkspaceEngine()) {
              await requestRustSnapshotTransaction<{ finished: true }>(
                { kind: 'historyResetFinish', token: owner.state.token },
                (value) => value?.finished === true
              ).catch(() => undefined);
            }
          }
        });
      })
    )
  );
}

/** An unsupported phase is canonical; a mismatched acknowledged cursor retires rather than replaying callbacks. */
export async function completeRustHistoryResetPhase(phase: string, nextCount?: number): Promise<void> {
  const owner = owners.getStore();
  if (!owner?.state || !isRustHistoryResetOperation() || !phases(owner.options).includes(phase)) return;
  const before = owner.state;
  if (before.directive.phase !== phase) {
    owner.state = undefined;
    await retireRustSnapshotTransaction();
    return;
  }
  const expected = phases(owner.options)[phases(owner.options).indexOf(phase) + 1];
  owner.state = await requestRustHistoryReset<State>(
    {
      kind: 'historyResetReceipt',
      token: before.token,
      revision: before.revision,
      phase,
      ...(nextCount === undefined ? {} : { nextCount }),
    },
    (value) =>
      state(value, owner.options) &&
      value.token === before.token &&
      value.revision === before.revision + 1 &&
      value.directive.phase === expected
  );
}

/** Fork before the canonical concurrent map; each child owns an independent revision cursor. */
export async function forkRustHistoryResetComponents(count: number): Promise<State[] | undefined> {
  const owner = owners.getStore();
  const before = owner?.state;
  if (
    !owner ||
    !before ||
    before.directive.phase !== 'components' ||
    !isRustHistoryResetOperation() ||
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count > 4096
  )
    return undefined;
  const result = await requestRustHistoryReset<State & { children: Array<State & { index: number }> }>(
    { kind: 'historyResetFork', token: before.token, revision: before.revision, count },
    (value) =>
      state(value, owner.options) &&
      value.token === before.token &&
      value.revision === before.revision + 1 &&
      value.directive.phase === 'components' &&
      'children' in value &&
      Array.isArray(value.children) &&
      value.children.length === count &&
      value.children.every(
        (child, index) =>
          child.index === index &&
          hash(child.token) &&
          child.revision === 0 &&
          child.directive?.phase === 'model' &&
          child.directive.count === 1
      ) &&
      new Set(value.children.map((child) => child.token)).size === count
  );
  if (!result) {
    owner.state = undefined;
    return undefined;
  }
  owner.state = result;
  return result.children;
}

export function withRustHistoryResetComponent<T>(child: State | undefined, action: () => Promise<T>): Promise<T> {
  const owner = owners.getStore();
  return childOwners.run({ state: child }, () =>
    withRustHistoryResetRefPlan(action, () => Boolean(owner && !owner.closing))
  );
}

export async function completeRustHistoryResetComponentPhase(phase: string): Promise<void> {
  const owner = childOwners.getStore();
  const before = owner?.state;
  if (!owner || !before || !isRustHistoryResetOperation()) return;
  if (before.directive.phase !== phase) {
    owner.state = undefined;
    await retireRustSnapshotTransaction();
    return;
  }
  const next = childPhases[childPhases.indexOf(phase) + 1];
  owner.state = await requestRustHistoryReset<State>(
    { kind: 'historyResetReceipt', token: before.token, revision: before.revision, phase },
    (value) =>
      value?.token === before.token &&
      value.revision === before.revision + 1 &&
      value.directive?.phase === next &&
      value.directive.count === (next === 'done' ? 0 : 1)
  );
}

function dense(value: any): value is any[] {
  if (isProxy(value)) return false;
  if (
    (!hasRustSnapshotTransactionClass(value, 'Array') && !hasRustSnapshotTransactionClass(value, 'ComponentIdList')) ||
    value.length > 4096
  )
    return false;
  const fields = Object.getOwnPropertyDescriptors(value);
  return (
    Reflect.ownKeys(fields).length === value.length + 1 &&
    Reflect.ownKeys(fields).every(
      (key) =>
        key === 'length' ||
        (typeof key === 'string' &&
          /^(0|[1-9][0-9]*)$/.test(key) &&
          Number(key) < value.length &&
          'value' in fields[key] &&
          fields[key].enumerable)
    )
  );
}

function idText(id: ComponentID, version = false): string | undefined {
  const projected = snapshotPolicyId(id);
  if (
    !projected ||
    typeof projected.name !== 'string' ||
    (projected.scope !== undefined && typeof projected.scope !== 'string') ||
    (projected.version !== undefined && typeof projected.version !== 'string')
  )
    return undefined;
  return `${projected.scope ? `${projected.scope}/` : ''}${projected.name}${version && projected.version ? `@${projected.version}` : ''}`;
}

function modelName(component: ModelComponent): string | undefined {
  if (!hasRustSnapshotTransactionClassFields(component, 'ModelComponent', ['scope', 'name'])) return undefined;
  const name = Object.getOwnPropertyDescriptor(component, 'name')?.value;
  const scope = Object.getOwnPropertyDescriptor(component, 'scope')?.value;
  if (typeof name !== 'string' || (scope !== undefined && scope !== null && typeof scope !== 'string'))
    return undefined;
  return `${scope ? `${scope}/` : ''}${name}`;
}

function indices(values: unknown, count: number): values is number[] {
  return (
    Array.isArray(values) &&
    values.length <= count &&
    new Set(values).size === values.length &&
    values.every((value) => Number.isSafeInteger(value) && value >= 0 && value < count)
  );
}

/** DTO arrays never inherit ComponentIdList species or iteration behavior. */
function projectResetList<T, U>(values: T[], project: (value: T) => U): U[] {
  const result: U[] = [];
  for (let index = 0; index < values.length; index += 1) result[index] = project(values[index]);
  return result;
}
function sameResetMembers<T>(values: T[], before: T[]): boolean {
  if (!dense(values) || values.length !== before.length) return false;
  for (let index = 0; index < before.length; index += 1) if (values[index] !== before[index]) return false;
  return true;
}

/** Preserve model aliases while Rust owns pattern membership. The caller constructs its canonical ID list first. */
export async function selectRustResetPattern(
  components: ModelComponent[],
  matches: ComponentIdList
): Promise<ModelComponent[] | undefined> {
  if (!isRustHistoryResetOperation() || !dense(components) || !dense(matches)) return undefined;
  const models = projectResetList(components, (model) => model),
    matchIds = projectResetList(matches, (id) => id);
  const names = projectResetList(components, modelName),
    ids = projectResetList(matches, (id) => idText(id));
  if (names.some((name) => name === undefined) || ids.some((id) => id === undefined)) return undefined;
  const result = await requestRustHistoryReset<{ selected: number[] }>(
    { kind: 'historyResetPattern', components: names, matches: ids },
    (value) => indices(value?.selected, components.length)
  );
  if (
    !result ||
    !sameResetMembers(components, models) ||
    !sameResetMembers(matches, matchIds) ||
    names.some((name, index) => modelName(components[index]) !== name) ||
    ids.some((id, index) => idText(matches[index]) !== id)
  )
    return undefined;
  return result.selected.map((index) => components[index]);
}

export async function selectRustResetCandidates(
  components: ModelComponent[],
  removed: ComponentID[]
): Promise<number[] | undefined> {
  if (!isRustHistoryResetOperation() || !dense(components) || !dense(removed)) return undefined;
  const models = projectResetList(components, (model) => model),
    removedIds = projectResetList(removed, (id) => id);
  const names = projectResetList(components, modelName),
    ids = projectResetList(removed, (id) => idText(id));
  if (names.some((name) => name === undefined) || ids.some((id) => id === undefined)) return undefined;
  const result = await requestRustHistoryReset<{ missing: number[] }>(
    { kind: 'historyResetCandidates', components: names, removed: ids },
    (value) => indices(value?.missing, removed.length)
  );
  if (
    !result ||
    !sameResetMembers(components, models) ||
    !sameResetMembers(removed, removedIds) ||
    names.some((name, index) => modelName(components[index]) !== name) ||
    ids.some((id, index) => idText(removed[index]) !== id)
  )
    return undefined;
  return result.missing;
}

export type SoftResetPlan = {
  selected: number[];
  entries: ComponentMap[];
  versions: Array<string | null>;
  valid: () => boolean;
};
/** Pure backing-state capture never adds getComponent callbacks before their canonical serial clear effects. */
export async function selectRustResetSoft(bitmap: BitMap, ids: ComponentID[]): Promise<SoftResetPlan | undefined> {
  if (!isRustHistoryResetOperation() || !dense(ids) || !canRecoverBitmapNatively(bitmap)) return undefined;
  const capture = () => {
    if (!dense(ids) || !canRecoverBitmapNatively(bitmap)) return undefined;
    const maps = Object.getOwnPropertyDescriptor(bitmap, 'components')?.value as ComponentMap[];
    const updated = Object.getOwnPropertyDescriptor(bitmap, 'updatedIds')?.value;
    if (
      !dense(maps) ||
      !updated ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(updated)) ||
      Reflect.ownKeys(updated).length
    )
      return undefined;
    const candidates = maps.map((entry) => ({
      entry,
      id: idText(Object.getOwnPropertyDescriptor(entry, 'id')?.value, true),
      name: idText(Object.getOwnPropertyDescriptor(entry, 'id')?.value),
    }));
    if (candidates.some((entry) => entry.id === undefined || entry.name === undefined)) return undefined;
    const entries: ComponentMap[] = [],
      versions: Array<string | null> = [];
    for (const id of ids) {
      const full = idText(id, true),
        name = idText(id);
      if (full === undefined || name === undefined) return undefined;
      const entry = (
        candidates.find((candidate) => candidate.id === full) || candidates.find((candidate) => candidate.name === name)
      )?.entry;
      if (!entry) return undefined;
      const field = Object.getOwnPropertyDescriptor(entry, 'nextVersion');
      if (field && (!('value' in field) || !field.configurable)) return undefined;
      const next = field?.value;
      if (next !== undefined && (!next || ![Object.prototype, null].includes(Object.getPrototypeOf(next))))
        return undefined;
      const version = next && Object.getOwnPropertyDescriptor(next, 'version');
      if (version && (!('value' in version) || (version.value !== undefined && typeof version.value !== 'string')))
        return undefined;
      entries.push(entry);
      versions.push(version?.value || null);
    }
    return { entries, versions, names: ids.map((id) => idText(id, true)) };
  };
  const before = capture();
  if (!before) return undefined;
  const aliases = before.entries.map((entry) => before.entries.indexOf(entry));
  const result = await requestRustHistoryReset<{ selected: number[] }>(
    { kind: 'historyResetSoft', versions: before.versions, aliases },
    (value) => indices(value?.selected, ids.length)
  );
  const valid = () => {
    const current = capture();
    return Boolean(
      current &&
        current.entries.length === before.entries.length &&
        current.entries.every(
          (entry, index) =>
            entry === before.entries[index] &&
            current.versions[index] === before.versions[index] &&
            current.names[index] === before.names[index]
        )
    );
  };
  return result && valid()
    ? { selected: result.selected, entries: before.entries, versions: before.versions, valid }
    : undefined;
}

export async function selectRustNeverExported(
  ids: ComponentIdList
): Promise<{ hashes: string[]; unique: number[] } | undefined> {
  if (!isRustHistoryResetOperation() || !dense(ids) || !hasRustSnapshotFunctions(['SnapshotBitObject']))
    return undefined;
  const members = projectResetList(ids, (id) => id);
  const names = projectResetList(ids, (id) => snapshotPolicyId(id)?.name);
  if (names.some((name) => typeof name !== 'string')) return undefined;
  const result = await requestRustHistoryReset<{ hashes: string[]; unique: number[] }>(
    { kind: 'historyResetNeverExported', fullNames: names },
    (value) =>
      Array.isArray(value?.hashes) &&
      value.hashes.length === ids.length &&
      value.hashes.every(hash) &&
      indices(value.unique, ids.length)
  );
  return result &&
    sameResetMembers(ids, members) &&
    hasRustSnapshotFunctions(['SnapshotBitObject']) &&
    names.every((name, index) => snapshotPolicyId(ids[index])?.name === name)
    ? result
    : undefined;
}

function refHashes(refs: Ref[]): string[] | undefined {
  if (!dense(refs)) return undefined;
  const values: string[] = [];
  for (const ref of refs) {
    if (!hasRustSnapshotTransactionClass(ref, 'Ref')) return undefined;
    const value = Object.getOwnPropertyDescriptor(ref, 'hash')?.value;
    if (!hash(value)) return undefined;
    values.push(value);
  }
  return values;
}

function canReadRustResetLocalHashes(component: ModelComponent, lane?: Lane): boolean {
  return !(
    !isRustHistoryResetOperation() ||
    !hasRustSnapshotTransactionClass(component, 'ModelComponent') ||
    (lane && !hasRustSnapshotTransactionClass(lane, 'Lane')) ||
    !hasRustSnapshotFunctionReference('HistoryResetGetDivergeData', getDivergeData) ||
    !hasRustSnapshotFunctionReference('HistoryResetPMapPool', pMapPool) ||
    !hasRustSnapshotFunctionReference('HistoryResetConcurrentComponentsLimit', concurrentComponentsLimit) ||
    (component.detachedHeads && !hasRustSnapshotTransactionClass(component.detachedHeads, 'DetachedHeads'))
  );
}

/** Once divergence/load callbacks run, all fallback is the remaining captured algorithm, never getLocalHashes again. */
export async function getRustResetLocalHashes(
  component: ModelComponent,
  repo: Repository,
  workspaceId?: ComponentID,
  lane?: Lane
): Promise<Ref[] | undefined> {
  if (!canReadRustResetLocalHashes(component, lane)) return undefined;
  await component.setDivergeData(repo, undefined, undefined, workspaceId);
  const local = component.getDivergeData().snapsOnSourceOnly;
  const detached = component.detachedHeads && component.detachedHeads.getAllHeads().length > 0;
  if (detached && component.head) {
    const main = await getDivergeData({
      repo,
      modelComponent: component,
      targetHead: (component.laneId ? component.calculatedRemoteHeadWhenOnLane : component.remoteHead) || null,
      sourceHead: component.head,
      throws: false,
    });
    const sourceOnly = refHashes(local),
      mainOnly = refHashes(main.snapsOnSourceOnly);
    const result =
      sourceOnly && mainOnly
        ? await requestRustHistoryReset<{ sourceAppend: number[]; combined: string[] }>(
            { kind: 'historyResetLocalAppend', sourceOnly, mainOnly },
            (value) =>
              indices(value?.sourceAppend, mainOnly.length) &&
              Array.isArray(value.combined) &&
              value.combined.every(hash)
          )
        : undefined;
    if (
      result &&
      refHashes(local)?.join() === sourceOnly?.join() &&
      refHashes(main.snapsOnSourceOnly)?.join() === mainOnly?.join()
    ) {
      for (const index of result.sourceAppend) local.push(main.snapsOnSourceOnly[index]);
    } else {
      for (const ref of main.snapsOnSourceOnly) if (!local.find((existing) => existing.isEqual(ref))) local.push(ref);
    }
  }
  if (!local.length) return [];
  if (!lane) return reverseRustResetLocalRefs(local);
  const laneHead = lane.getCompHeadIncludeUpdateDependents(component.toComponentId());
  const sourceOnly = refHashes(local),
    laneHashes = laneHead ? refHashes([laneHead]) : [];
  const read =
    sourceOnly && laneHashes
      ? await requestRustHistoryReset<{ load: number[] }>(
          { kind: 'historyResetLocalRead', sourceOnly, ...(laneHead ? { laneHead: laneHashes[0] } : {}) },
          (value) => indices(value?.load, local.length)
        )
      : undefined;
  const sameLaneHead = () => refHashes(laneHead ? [laneHead] : [])?.join() === laneHashes?.join();
  const load =
    read && refHashes(local)?.join() === sourceOnly?.join() && sameLaneHead() ? new Set(read.load) : undefined;
  const observed = await pMapPool(
    local.map((ref, index) => ({ ref, index })),
    async ({ ref, index }) => {
      if (load ? !load.has(index) : laneHead && ref.isEqual(laneHead)) return { ref, keep: true, metadata: undefined };
      const object = (await ref.load(repo)) as Version | undefined;
      if (!object)
        return {
          ref,
          keep: false,
          metadata: { hash: Object.getOwnPropertyDescriptor(ref, 'hash')?.value, missing: true },
        };
      const originLane = Boolean(object.originLaneId);
      const squashed = Boolean(object.squashed);
      const unrelated = squashed ? false : Boolean(object.unrelated);
      return {
        ref,
        keep: originLane || squashed || unrelated,
        metadata: { hash: Object.getOwnPropertyDescriptor(ref, 'hash')?.value, originLane, squashed, unrelated },
      };
    },
    { concurrency: concurrentComponentsLimit() }
  );
  const result =
    sourceOnly && laneHashes && sameLaneHead() && refHashes(local)?.join() === sourceOnly.join()
      ? await requestRustHistoryReset<{ selected: Array<{ source: number }> }>(
          {
            kind: 'historyResetLocalVersions',
            sourceOnly,
            lane: true,
            ...(laneHead ? { laneHead: laneHashes[0] } : {}),
            metadata: observed.map((row) => row.metadata).filter(Boolean),
            tags: [],
            orphaned: [],
          },
          (value) =>
            Array.isArray(value?.selected) &&
            indices(
              value.selected.map((row) => row.source),
              observed.length
            )
        )
      : undefined;
  return result && refHashes(local)?.join() === sourceOnly?.join() && sameLaneHead()
    ? result.selected.map((row) => observed[row.source].ref)
    : observed
        .filter((row) => row.keep)
        .map((row) => row.ref)
        .reverse();
}

/** Preserve the canonical nonempty source array identity while applying the native permutation. */
async function reverseRustResetLocalRefs(local: Ref[]): Promise<Ref[]> {
  const sourceOnly = refHashes(local);
  const result = sourceOnly
    ? await requestRustHistoryReset<{ selected: Array<{ source: number }> }>(
        { kind: 'historyResetLocalVersions', sourceOnly, lane: false, metadata: [], tags: [], orphaned: [] },
        (value) =>
          Array.isArray(value?.selected) &&
          value.selected.length === sourceOnly.length &&
          indices(
            value.selected.map((row) => row.source),
            local.length
          )
      )
    : undefined;
  // Canonical no-lane returns this exact reversed array, including its Ref aliases.
  if (result && refHashes(local)?.join() === sourceOnly?.join()) {
    const aliases = local.slice();
    for (let index = 0; index < result.selected.length; index += 1)
      local[index] = aliases[result.selected[index].source];
    return local;
  }
  return local.reverse();
}

function sameFieldDescriptor(before?: PropertyDescriptor, after?: PropertyDescriptor): boolean {
  if (!before || !after) return before === after;
  return (
    before.value === after.value &&
    before.get === after.get &&
    before.set === after.set &&
    before.writable === after.writable &&
    before.enumerable === after.enumerable &&
    before.configurable === after.configurable
  );
}
function sameFieldMap(map: object, before: PropertyDescriptorMap): boolean {
  const keys = Reflect.ownKeys(before),
    after = Object.getOwnPropertyDescriptors(map);
  return (
    keys.length === Reflect.ownKeys(after).length &&
    keys.every((key) =>
      sameFieldDescriptor(
        Object.getOwnPropertyDescriptor(before, key)?.value,
        Object.getOwnPropertyDescriptor(after, key)?.value
      )
    )
  );
}

function sameLabelRows(
  before: Array<{ label: string; hash: string }>,
  after?: Array<{ label: string; hash: string }>
): boolean {
  return Boolean(
    after &&
      before.length === after.length &&
      before.every((row, index) => row.label === after[index].label && row.hash === after[index].hash)
  );
}

/** Apply tag-cache mutations only at the canonical switchHashesWithTagsIfExist boundary. */
export async function selectRustResetLabels(component: ModelComponent, refs: Ref[]): Promise<string[] | undefined> {
  if (
    !isRustHistoryResetOperation() ||
    !hasRustSnapshotTransactionClass(component, 'ModelComponent') ||
    !hasRustSnapshotFunctions(['HistoryResetModelLodash'])
  )
    return undefined;
  const sourceOnly = refHashes(refs);
  const captureMap = (map: any) => {
    if (!map || isProxy(map) || ![Object.prototype, null].includes(Object.getPrototypeOf(map))) return undefined;
    const rows: Array<{ label: string; hash: string }> = [];
    for (const key of Reflect.ownKeys(map)) {
      const field = Object.getOwnPropertyDescriptor(map, key)!;
      if (typeof key !== 'string' || !('value' in field) || !field.enumerable) return undefined;
      const hashes = refHashes([field.value]);
      if (!hashes) return undefined;
      rows.push({ label: key, hash: hashes[0] });
    }
    return rows;
  };
  const tagMap = component.versions,
    orphanedMap = component.orphanedVersions;
  const tags = captureMap(tagMap),
    orphaned = captureMap(orphanedMap);
  const tagFields = tags && Object.getOwnPropertyDescriptors(tagMap);
  const orphanedFields = orphaned && Object.getOwnPropertyDescriptors(orphanedMap);
  const descriptor = Object.getOwnPropertyDescriptor(component, 'lastFoundTag');
  const lastFoundTag = descriptor?.value;
  if (
    !sourceOnly ||
    !tags ||
    !orphaned ||
    (lastFoundTag !== undefined && typeof lastFoundTag !== 'string') ||
    (descriptor ? !descriptor.writable : !Object.isExtensible(component))
  )
    return undefined;
  const result = await requestRustHistoryReset<{
    labels: string[];
    lastFoundTag?: string;
    lastFoundTagPresent: boolean;
  }>(
    {
      kind: 'historyResetLocalVersions',
      sourceOnly,
      lane: false,
      metadata: [],
      tags,
      orphaned,
      reverse: false,
      ...(lastFoundTag !== undefined ? { lastFoundTag } : {}),
    },
    (value) =>
      Array.isArray(value?.labels) &&
      value.labels.length === refs.length &&
      value.labels.every((label) => typeof label === 'string') &&
      typeof value.lastFoundTagPresent === 'boolean' &&
      (!value.lastFoundTagPresent || typeof value.lastFoundTag === 'string')
  );
  if (
    !result ||
    !hasRustSnapshotTransactionClass(component, 'ModelComponent') ||
    !hasRustSnapshotFunctions(['HistoryResetModelLodash']) ||
    refHashes(refs)?.join() !== sourceOnly.join() ||
    component.versions !== tagMap ||
    component.orphanedVersions !== orphanedMap ||
    !sameFieldMap(tagMap, tagFields!) ||
    !sameFieldMap(orphanedMap, orphanedFields!) ||
    !sameLabelRows(tags, captureMap(tagMap)) ||
    !sameLabelRows(orphaned, captureMap(orphanedMap)) ||
    !sameFieldDescriptor(descriptor, Object.getOwnPropertyDescriptor(component, 'lastFoundTag')) ||
    (descriptor ? !descriptor.writable : !Object.isExtensible(component))
  )
    return undefined;
  if (result.lastFoundTagPresent)
    Object.defineProperty(component, 'lastFoundTag', {
      ...(descriptor || { writable: true, configurable: true, enumerable: true }),
      value: result.lastFoundTag,
    });
  return result.labels;
}

export function loadRustResetDependents(scope: Scope): Promise<DependencyGraph> {
  if (!isRustHistoryResetOperation()) return DependencyGraph.loadAllVersions(scope);
  return DependencyGraph.loadResetIndex(scope, async (rows, queries) => {
    const result = await requestRustHistoryReset<{ dependents: string[][]; outside: string[][] }>(
      { kind: 'historyResetDependents', rows, queries },
      (value) =>
        Array.isArray(value?.dependents) &&
        value.dependents.length === queries.length &&
        value.dependents.every((list) => Array.isArray(list) && list.every((id) => typeof id === 'string')) &&
        Array.isArray(value.outside) &&
        value.outside.length === queries.length
    );
    return result?.dependents;
  });
}
