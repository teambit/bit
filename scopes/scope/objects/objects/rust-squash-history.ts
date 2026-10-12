import { canReadCacheNatively } from '@teambit/harmony.modules.in-memory-cache';
import { canReadLiveObjectsNatively } from './live-objects';
import { isDeepStrictEqual } from 'util';
import { type SnapsDistance, canPlanSquashNatively } from '@teambit/component.snap-distance';
import { typesObj } from '@teambit/legacy.scope';
import { withWorkspaceSession } from '@teambit/component.sources';
import type Version from '../models/version';
import type VersionHistory from '../models/version-history';
import type ModelComponent from '../models/model-component';
import type Repository from './repository';
import type Ref from './ref';
import { hasCanonicalRefMethods } from './ref';
import { isRustSnapshotOperation } from './rust-snapshot';
import { hasRustSnapshotFunctions } from './rust-snapshot-guards';

type Constructor = { prototype: any; parse?: unknown };
type Registered = {
  kind: string;
  constructor: Constructor;
  methods: Map<string, PropertyDescriptor | undefined>;
  parse?: unknown;
};
// Model registration may run through a partially initialized cyclic objects import.
// eslint-disable-next-line no-var
var models: Registered[] | undefined;
// eslint-disable-next-line no-var
var checkoutSourceDefault: { constructor: Constructor; parse: unknown } | undefined;
function property(object: object, name: string): PropertyDescriptor | undefined {
  let owner: object | null = object;
  while (owner) {
    const found = Object.getOwnPropertyDescriptor(owner, name);
    if (found) return found;
    owner = Object.getPrototypeOf(owner);
  }
  return undefined;
}
export function registerRustSquashModels(constructors: Record<string, Constructor | undefined>): void {
  models ||= [];
  for (const [kind, constructor] of Object.entries(constructors)) {
    if (kind === 'Source') {
      if (constructor) checkoutSourceDefault ||= { constructor, parse: constructor.parse };
      continue;
    }
    if (!constructor || models.some((entry) => entry.constructor === constructor)) continue;
    const names = [
      'hash',
      'toBuffer',
      'addAsOnlyParent',
      'removeParent',
      'setSquashed',
      'addModifiedLog',
      'isLegacy',
      'getVersionHistory',
      'updateRebasedVersionHistory',
      'getVersionData',
      'addFromVersionsObjects',
      'versions',
    ];
    models.push({
      kind,
      constructor,
      parse: constructor.parse,
      methods: new Map(names.map((name) => [name, property(constructor.prototype, name)])),
    });
  }
}
function ordinary(object: object, names: string[]): boolean {
  const entry = models?.find((registered) => Object.getPrototypeOf(object) === registered.constructor.prototype);
  return Boolean(
    entry &&
      names.every((name) => {
        const expected = entry.methods.get(name);
        const actual = property(object, name);
        return (
          expected &&
          actual &&
          actual.value === expected.value &&
          actual.get === expected.get &&
          actual.set === expected.set
        );
      })
  );
}
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
function ordinaryRef(ref: Ref | null | undefined): boolean {
  return !ref || (hasCanonicalRefMethods(ref) && hash(Object.getOwnPropertyDescriptor(ref, 'hash')?.value));
}
const arrays = new Map(
  ['map', 'every', 'some', 'forEach', 'filter'].map((name) => [name, property(Array.prototype, name)?.value])
);
function standardArray(value: unknown): value is any[] {
  return (
    Array.isArray(value) &&
    Object.getPrototypeOf(value) === Array.prototype &&
    value.length <= 4096 &&
    Object.values(Object.getOwnPropertyDescriptors(value)).every((entry) => 'value' in entry) &&
    [...arrays].every(([name, method]) => property(value, name)?.value === method)
  );
}
function refArray(refs: Ref[]): boolean {
  return standardArray(refs) && refs.every((ref) => Boolean(ref) && ordinaryRef(ref));
}
function historyMap(history: VersionHistory): boolean {
  const map = Object.getOwnPropertyDescriptor(history, 'versionsObj')?.value;
  return Boolean(
    map &&
      Object.getPrototypeOf(map) === Object.prototype &&
      Object.entries(Object.getOwnPropertyDescriptors(map)).every(([key, entry]) => {
        if (!('value' in entry) || !entry.value || typeof entry.value !== 'object') return false;
        const ref = Object.getOwnPropertyDescriptor(entry.value, 'hash')?.value;
        return Boolean(ref && Object.getOwnPropertyDescriptor(ref, 'hash')?.value === key);
      })
  );
}
function ownData(object: object, names: string[]): boolean {
  return names.every((name) => {
    const descriptor = property(object, name);
    return !descriptor || 'value' in descriptor;
  });
}
function ordinaryDistance(distance: SnapsDistance): boolean {
  return (
    canPlanSquashNatively(distance) &&
    ownData(distance, ['snapsOnSourceOnly', 'snapsOnTargetOnly', 'commonSnapBeforeDiverge']) &&
    refArray(distance.snapsOnSourceOnly) &&
    refArray(distance.snapsOnTargetOnly) &&
    ordinaryRef(distance.commonSnapBeforeDiverge)
  );
}
async function request(input: object, validate: (data: any) => boolean): Promise<any | undefined> {
  if (!isRustSnapshotOperation()) return undefined;
  const bytes = Buffer.from(JSON.stringify(input));
  if (!bytes.length || bytes.length > 4 * 1024 * 1024) return undefined;
  return withWorkspaceSession(async (session) => {
    let result: any;
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
        result = response.data;
        return true;
      },
      4 * 1024 * 1024
    );
    if (failed || !result) await session.dispose();
    return result;
  });
}
export type SquashPlan = {
  action: 'skip' | 'requireVersion' | 'requireMainModel' | 'rewrite';
  parentChoice?: 'common' | 'main' | 'none';
  parents?: string[];
  previousParents?: string[];
};
/** Pure policy only; public parent mutation and imports remain in their original phases. */
export async function planRustSquash(
  distance: SnapsDistance,
  currentLaneDefault: boolean,
  detachHead: boolean,
  version?: Version,
  mainModelKnown = false,
  mainHead?: Ref
): Promise<SquashPlan | undefined> {
  const eligible = () =>
    isRustSnapshotOperation() &&
    ordinaryDistance(distance) &&
    ordinaryRef(mainHead) &&
    (!version ||
      (ordinary(version, ['hash', 'addAsOnlyParent', 'removeParent', 'setSquashed', 'addModifiedLog', 'isLegacy']) &&
        ownData(version, ['parents', 'schema', '_hash']) &&
        refArray(version.parents)));
  if (!eligible()) return undefined;
  const projection = () => ({
    kind: 'squashPolicy',
    sourceOnly: distance.snapsOnSourceOnly.map((ref) => ref.hash),
    targetOnly: distance.snapsOnTargetOnly.map((ref) => ref.hash),
    common: distance.commonSnapBeforeDiverge?.hash,
    detachHead,
    currentLaneDefault,
    currentParents: version?.parents.map((ref) => ref.hash),
    isLegacy: version?.isLegacy,
    mainHead: mainHead?.hash,
    mainModelKnown,
  });
  const input = projection();
  const parentRefs = version && [...version.parents];
  const commonRef = distance.commonSnapBeforeDiverge;
  const sourceRefs = [...distance.snapsOnSourceOnly];
  const targetRefs = [...distance.snapsOnTargetOnly];
  let expected: SquashPlan;
  const diverged = input.sourceOnly.length > 0 && input.targetOnly.length > 0;
  if (diverged ? !detachHead : input.sourceOnly.length > 0 || input.targetOnly.length === 0)
    expected = { action: 'skip' };
  else if (!version) expected = { action: 'requireVersion' };
  else if (input.targetOnly.length === 1 && input.common && input.currentParents?.length === 1)
    expected = { action: 'skip' };
  else if (!input.common && !currentLaneDefault && !mainModelKnown) expected = { action: 'requireMainModel' };
  else {
    const parentChoice = input.common ? 'common' : !currentLaneDefault && input.mainHead ? 'main' : 'none';
    const selected = parentChoice === 'common' ? input.common : input.mainHead;
    expected = {
      action: 'rewrite',
      parentChoice,
      parents: parentChoice === 'none' ? [] : input.isLegacy ? input.currentParents : [selected as string],
      previousParents: input.currentParents,
    };
  }
  const result = await request(input, (data) => isDeepStrictEqual(data, expected));
  if (
    !result ||
    !eligible() ||
    !isDeepStrictEqual(projection(), input) ||
    distance.commonSnapBeforeDiverge !== commonRef ||
    !sourceRefs.every((ref, index) => distance.snapsOnSourceOnly[index] === ref) ||
    !targetRefs.every((ref, index) => distance.snapsOnTargetOnly[index] === ref) ||
    (parentRefs && !parentRefs.every((ref, index) => version?.parents[index] === ref))
  )
    return undefined;
  return result;
}
// eslint-disable-next-line no-var
var repositoryDefaults:
  | {
      prototype: object;
      methods: Map<string, unknown>;
      descriptors: Map<string, PropertyDescriptor | undefined>;
      parser?: { constructor: object; methods: Map<string, unknown> };
    }
  | undefined;
export function registerRustSquashRepository(constructor: { prototype: Repository }, parser?: object): void {
  if (!repositoryDefaults)
    repositoryDefaults = {
      prototype: constructor.prototype,
      parser: parser && {
        constructor: parser,
        methods: new Map(
          ['parseObjectWithSize', 'parseObject', 'parseInflatedObjectWithSize', 'makeHash'].map((name) => [
            name,
            property(parser, name)?.value,
          ])
        ),
      },
      methods: new Map(
        [
          'load',
          'loadSync',
          'getCache',
          'getPath',
          'canPlanCheckoutNatively',
          'canReadCheckoutSourcesNatively',
          'canReadNatively',
          'isContentTransformed',
          'objectPath',
          'hashPath',
        ].map((name) => [name, property(constructor.prototype, name)?.value])
      ),
      descriptors: new Map(
        [
          'load',
          'loadSync',
          'getCache',
          'getPath',
          'canPlanCheckoutNatively',
          'canReadCheckoutSourcesNatively',
          'canReadNatively',
          'isContentTransformed',
          'objectPath',
          'hashPath',
        ].map((name) => [name, property(constructor.prototype, name)])
      ),
    };
}
function ordinaryPendingObjects(repository: Repository): boolean {
  const objects = Object.getOwnPropertyDescriptor(repository, 'objects')?.value;
  return Boolean(
    objects &&
      [null, Object.prototype].includes(Object.getPrototypeOf(objects)) &&
      Object.values(Object.getOwnPropertyDescriptors(objects)).every((entry) => 'value' in entry)
  );
}
function ordinaryRepository(repository: Repository): boolean {
  return Boolean(
    repositoryDefaults &&
      Object.getPrototypeOf(repository) === repositoryDefaults.prototype &&
      [...repositoryDefaults.methods].every(([name, method]) => property(repository, name)?.value === method)
  );
}

/** Guard the defining loader/cache/parser domain before any speculative checkout capability call. */
export function canReadRustCheckoutRepository(repository: Repository, sources: Ref[], versions: Ref[] = []): boolean {
  const sourceClass = checkoutSourceDefault;
  const versionClass = models?.find((entry) => entry.kind === 'Version');
  if (
    !repositoryDefaults ||
    !hasRustSnapshotFunctions(['SnapshotRepositoryFS', 'SnapshotRepositoryPath', 'SnapshotRepositoryLogger']) ||
    !ordinaryRepository(repository) ||
    !sourceClass ||
    !versionClass ||
    !ownData(repository, ['onRead', 'defaultOnRead', 'scopePath', 'objects', 'cache', 'liveObjects']) ||
    !ordinaryPendingObjects(repository) ||
    !refArray(sources) ||
    !refArray(versions) ||
    !canReadCacheNatively(Object.getOwnPropertyDescriptor(repository, 'cache')?.value) ||
    !canReadLiveObjectsNatively(Object.getOwnPropertyDescriptor(repository, 'liveObjects')?.value)
  )
    return false;
  for (const [name, before] of repositoryDefaults.descriptors) {
    const after = property(repository, name);
    if (
      !before ||
      !after ||
      before.value !== after.value ||
      before.get !== after.get ||
      before.set !== after.set ||
      before.enumerable !== after.enumerable ||
      before.configurable !== after.configurable ||
      before.writable !== after.writable
    )
      return false;
  }
  if (
    !repositoryDefaults.parser ||
    [...repositoryDefaults.parser.methods].some(
      ([name, method]) => property(repositoryDefaults!.parser!.constructor, name)?.value !== method
    ) ||
    Object.getOwnPropertyDescriptor(typesObj, 'Source')?.value !== sourceClass.constructor ||
    property(sourceClass.constructor, 'parse')?.value !== sourceClass.parse ||
    Object.getOwnPropertyDescriptor(typesObj, 'Version')?.value !== versionClass.constructor ||
    property(versionClass.constructor, 'parse')?.value !== versionClass.parse
  )
    return false;
  return repository.canPlanCheckoutNatively(versions) && repository.canReadCheckoutSourcesNatively(sources);
}
/** Read fresh disk Version messages while respecting mutable canonical caches and parser hooks. */
export async function readRustSquashMessages(
  repository: Repository,
  refs: Ref[]
): Promise<Array<string | null> | undefined> {
  const versionClass = models?.find((entry) => entry.kind === 'Version');
  const eligible = () =>
    isRustSnapshotOperation() &&
    ordinaryRepository(repository) &&
    ownData(repository, ['onRead', 'defaultOnRead', 'scopePath', 'objects', 'cache', 'liveObjects']) &&
    ordinaryPendingObjects(repository) &&
    canReadCacheNatively(Object.getOwnPropertyDescriptor(repository, 'cache')?.value) &&
    canReadLiveObjectsNatively(Object.getOwnPropertyDescriptor(repository, 'liveObjects')?.value) &&
    repositoryDefaults?.parser &&
    [...repositoryDefaults.parser.methods].every(
      ([name, method]) => property(repositoryDefaults!.parser!.constructor, name)?.value === method
    ) &&
    refArray(refs) &&
    versionClass &&
    Object.getOwnPropertyDescriptor(typesObj, 'Version')?.value === versionClass.constructor &&
    property(versionClass.constructor, 'parse')?.value === versionClass.parse &&
    repository.canPlanCheckoutNatively(refs);
  if (!eligible()) return undefined;
  const hashes = refs.map((ref) => ref.hash);
  const directory = repository.getPath();
  const cachedMessages = () =>
    refs.map((ref) => {
      const cached = repository.getCache(ref) as Version | undefined;
      if (!cached) return { cached: undefined, message: undefined };
      if (
        !ordinary(cached, ['hash']) ||
        !ownData(cached, ['log']) ||
        !cached.log ||
        Object.getPrototypeOf(cached.log) !== Object.prototype ||
        !ownData(cached.log, ['message'])
      )
        return undefined;
      const message = cached.log.message;
      if (message !== undefined && message !== null && typeof message !== 'string') return undefined;
      return { cached, message };
    });
  const cached = cachedMessages();
  if (cached.some((entry) => !entry)) return undefined;
  const result = await request(
    { kind: 'squashMessages', objectsDirectory: directory, refs: hashes },
    (data) =>
      Array.isArray(data.messages) &&
      data.messages.length === hashes.length &&
      data.messages.every((message) => message === null || typeof message === 'string')
  );
  if (
    !result ||
    !eligible() ||
    repository.getPath() !== directory ||
    !isDeepStrictEqual(
      refs.map((ref) => ref.hash),
      hashes
    )
  )
    return undefined;
  const currentCached = cachedMessages();
  if (
    currentCached.some(
      (entry, index) =>
        !entry ||
        entry.cached !== cached[index]?.cached ||
        entry.message !== cached[index]?.message ||
        (entry.cached && (entry.message ?? null) !== result.messages[index])
    )
  )
    return undefined;
  return result.messages;
}
function ordinaryHistoryRecords(history: VersionHistory): boolean {
  return history.versions.every((record) =>
    Boolean(
      record &&
        typeof record === 'object' &&
        ownData(record, ['hash', 'parents', 'unrelated', 'squashed']) &&
        record.hash &&
        ordinaryRef(record.hash)
    )
  );
}
function ordinaryIncomingVersion(version: Version): boolean {
  return Boolean(
    version &&
      ordinary(version, ['hash']) &&
      ownData(version, ['parents', 'unrelated', 'squashed', '_hash']) &&
      hash(Object.getOwnPropertyDescriptor(version, '_hash')?.value) &&
      refArray(version.parents) &&
      (!version.unrelated ||
        (typeof version.unrelated === 'object' &&
          ownData(version.unrelated, ['head']) &&
          version.unrelated.head &&
          ordinaryRef(version.unrelated.head))) &&
      (!version.squashed ||
        (typeof version.squashed === 'object' &&
          ownData(version.squashed, ['previousParents']) &&
          refArray(version.squashed.previousParents)))
  );
}
/** Select only the first present incoming record, matching the canonical versions.some mutation. */
export async function rebaseRustVersionHistory(
  model: ModelComponent,
  history: VersionHistory,
  versions: Version[]
): Promise<boolean | undefined> {
  const eligible = () =>
    isRustSnapshotOperation() &&
    ordinary(model, ['getVersionHistory', 'updateRebasedVersionHistory']) &&
    ordinary(history, ['getVersionData', 'addFromVersionsObjects', 'versions']) &&
    ownData(history, ['versionsObj']) &&
    historyMap(history) &&
    ordinaryHistoryRecords(history) &&
    standardArray(versions) &&
    versions.every(ordinaryIncomingVersion);
  if (!eligible()) return undefined;
  const records = history.versions;
  const project = () => ({
    kind: 'historyRebase',
    existingHashes: history.versions.map((record) => record.hash.hash),
    incoming: versions.map((version) => ({
      hash: version.hash().hash,
      parents: version.parents.map((ref) => ref.hash),
      unrelated: version.unrelated?.head.hash,
      squashed: version.squashed?.previousParents.map((ref) => ref.hash),
    })),
  });
  const input = project();
  const incomingIndex = input.incoming.findIndex((incoming) => input.existingHashes.includes(incoming.hash));
  const expected =
    incomingIndex < 0
      ? {}
      : { incomingIndex, existingIndex: input.existingHashes.indexOf(input.incoming[incomingIndex].hash) };
  const result = await request(input, (data) => isDeepStrictEqual(data, expected));
  if (
    !result ||
    !eligible() ||
    !isDeepStrictEqual(project(), input) ||
    records.length !== history.versions.length ||
    !records.every((record, index) => history.versions[index] === record)
  )
    return undefined;
  if (incomingIndex < 0) return false;
  history.addFromVersionsObjects([versions[incomingIndex]]);
  return true;
}
