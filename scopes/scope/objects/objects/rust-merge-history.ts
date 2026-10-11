import { typesObj } from '@teambit/legacy.scope';
import type Version from '../models/version';
import { withWorkspaceSession } from '@teambit/component.sources';
import Ref from './ref';
import type Repository from './repository';
import type VersionHistory from '../models/version-history';
import { canPopulateHistoryNatively } from '../models/version-history';
import type { VersionParents } from '../models/version-history';
import { isRustSnapshotOperation } from './rust-snapshot';

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_RECORDS = 4096;
type VersionConstructor = { prototype: Version; parse: unknown };
// A cyclic models import can register the class before this module finishes initializing.
// eslint-disable-next-line no-var
var versionDefaults: { constructor: VersionConstructor; parse: unknown; hash: unknown } | undefined;
/** Register after model initialization so cyclic imports never capture an incomplete class. */
export function registerRustHistoryVersion(constructor: VersionConstructor | undefined): void {
  if (constructor && !versionDefaults)
    versionDefaults = { constructor, parse: constructor.parse, hash: constructor.prototype.hash };
}
function ordinaryVersionParser(): boolean {
  return Boolean(
    versionDefaults &&
      Object.getOwnPropertyDescriptor(typesObj, 'Version')?.value === versionDefaults.constructor &&
      Object.getOwnPropertyDescriptor(versionDefaults.constructor, 'parse')?.value === versionDefaults.parse
  );
}

const defaultRefFrom = Ref.from;
const defaults = { toString: Ref.prototype.toString, isEqual: Ref.prototype.isEqual, load: Ref.prototype.load };
// eslint-disable-next-line no-var
var repositoryDefaults: Array<readonly [string, unknown]> | undefined;
export function registerRustHistoryRepository(constructor: { prototype: Repository }): void {
  if (!repositoryDefaults)
    repositoryDefaults = ['load', 'getCache', 'getPath', 'canPlanCheckoutNatively'].map(
      (name) => [name, constructor.prototype[name]] as const
    );
}
function ordinaryRepository(repo: Repository): boolean {
  return Boolean(repositoryDefaults && repositoryDefaults.every(([name, method]) => repo[name] === method));
}

const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
type Record = { hash: string; parents: string[]; unrelated?: string; squashed?: string[] };
function ordinaryRef(ref: Ref): boolean {
  return Boolean(
    Ref.from === defaultRefFrom &&
      ref &&
      Object.getPrototypeOf(ref) === Ref.prototype &&
      hash(Object.getOwnPropertyDescriptor(ref, 'hash')?.value) &&
      Object.entries(defaults).every(
        ([name, method]) =>
          (Object.getOwnPropertyDescriptor(ref, name) || Object.getOwnPropertyDescriptor(Ref.prototype, name))
            ?.value === method
      )
  );
}
function project(records: VersionParents[]): Record[] | undefined {
  if (!Array.isArray(records) || records.length > MAX_RECORDS) return undefined;
  const result: Record[] = [];
  for (const record of records) {
    if (
      !record ||
      ['hash', 'parents', 'unrelated', 'squashed'].some((name) => Object.getOwnPropertyDescriptor(record, name)?.get) ||
      !ordinaryRef(record.hash) ||
      !Array.isArray(record.parents) ||
      !record.parents.every(ordinaryRef) ||
      (record.unrelated && !ordinaryRef(record.unrelated)) ||
      (record.squashed && (!Array.isArray(record.squashed) || !record.squashed.every(ordinaryRef)))
    )
      return undefined;
    result.push({
      hash: record.hash.hash,
      parents: record.parents.map((ref) => ref.hash),
      unrelated: record.unrelated?.hash,
      squashed: record.squashed?.map((ref) => ref.hash),
    });
  }
  return new Set(result.map((record) => record.hash)).size === result.length ? result : undefined;
}
function validRecord(record: any): record is Record {
  return (
    record &&
    hash(record.hash) &&
    Array.isArray(record.parents) &&
    record.parents.every(hash) &&
    (record.unrelated === undefined || hash(record.unrelated)) &&
    (record.squashed === undefined || (Array.isArray(record.squashed) && record.squashed.every(hash)))
  );
}
async function request(input: object, validate: (data: any) => boolean): Promise<any | undefined> {
  if (!isRustSnapshotOperation()) return undefined;
  const bytes = Buffer.from(JSON.stringify(input));
  if (!bytes.length || bytes.length > MAX_BYTES) return undefined;
  return withWorkspaceSession(async (session) => {
    let data: any;
    let failed = false;
    await session.request(
      (id) => {
        const header = Buffer.alloc(12);
        header.write('BMH1');
        header.writeUInt32BE(id, 4);
        header.writeUInt32BE(bytes.length, 8);
        return Buffer.concat([header, bytes]);
      },
      1,
      (response) => {
        failed = response.failed;
        if (failed) return response.completed === 0 && response.data === undefined;
        if (response.completed !== 1 || !response.data || typeof response.data !== 'object' || !validate(response.data))
          return false;
        data = response.data;
        return true;
      },
      32 * 1024 * 1024
    );
    if (failed) await session.dispose();
    return data;
  });
}

/** Read ancestry directly, then retain canonical Ref and cached Version identities at the public boundary. */
export async function loadRustVersionParents(
  repo: Repository,
  history: VersionHistory,
  head: Ref
): Promise<VersionParents[] | undefined> {
  if (
    !isRustSnapshotOperation() ||
    !canPopulateHistoryNatively(history) ||
    !ordinaryVersionParser() ||
    !ordinaryRef(head) ||
    !ordinaryRepository(repo) ||
    !repo.canPlanCheckoutNatively([head])
  )
    return undefined;
  const records = history.versions;
  const cached = project(records);
  if (!cached) return undefined;
  const snapshot = JSON.stringify(cached);
  const headHash = head.hash;
  const objectsDirectory = repo.getPath();
  const data = await request(
    {
      kind: 'graph',
      objectsDirectory,
      heads: [headHash],
      cached,
      overlay: [],
    },
    (response) => validAdded(response.added, cached, headHash)
  );
  if (
    !data ||
    !Array.isArray(data.added) ||
    data.added.length > MAX_RECORDS ||
    !data.added.every(validRecord) ||
    !validAdded(data.added, cached, headHash) ||
    !ordinaryVersionParser() ||
    !ordinaryRef(head) ||
    head.hash !== headHash ||
    !canPopulateHistoryNatively(history) ||
    !ordinaryRepository(repo) ||
    repo.getPath() !== objectsDirectory ||
    JSON.stringify(project(history.versions)) !== snapshot ||
    !repo.canPlanCheckoutNatively(data.added.map((record: Record) => Ref.from(record.hash)))
  )
    return undefined;
  const added: VersionParents[] = [];
  for (const record of data.added as Record[]) {
    const existing = cachedVersionParents(repo, record);
    if (existing === false) return undefined;
    added.push(
      existing || {
        hash: Ref.from(record.hash),
        parents: record.parents.map(Ref.from),
        unrelated: record.unrelated ? Ref.from(record.unrelated) : undefined,
        squashed: record.squashed?.map(Ref.from),
      }
    );
  }
  return added;
}

export async function getRustDivergence(
  records: VersionParents[],
  source: Ref,
  target: Ref,
  unmergedUnrelated: boolean
): Promise<
  | {
      sourceOnly: string[];
      targetOnly: string[];
      common?: string;
      noCommon: boolean;
    }
  | undefined
> {
  if (!isRustSnapshotOperation() || !ordinaryRef(source) || !ordinaryRef(target)) return undefined;
  const versions = project(records);
  if (!versions) return undefined;
  const snapshot = JSON.stringify(versions);
  const sourceHash = source.hash;
  const targetHash = target.hash;
  const result = await request(
    {
      kind: 'diverge',
      versions,
      sourceHead: source.hash,
      targetHead: target.hash,
      unmergedUnrelated,
    },
    (data) => validDivergence(data, versions, sourceHash, targetHash, unmergedUnrelated)
  );
  if (
    !result ||
    !validDivergence(result, versions, sourceHash, targetHash, unmergedUnrelated) ||
    !Array.isArray(result.sourceOnly) ||
    !result.sourceOnly.every(hash) ||
    !Array.isArray(result.targetOnly) ||
    !result.targetOnly.every(hash) ||
    (result.common !== undefined && !hash(result.common)) ||
    typeof result.noCommon !== 'boolean' ||
    !ordinaryRef(source) ||
    !ordinaryRef(target) ||
    source.hash !== sourceHash ||
    target.hash !== targetHash ||
    JSON.stringify(project(records)) !== snapshot
  )
    return undefined;
  return result;
}

/** Require exactly the ordered, reachable additions requested by the canonical parent-only traversal. */
function validAdded(value: unknown, cached: Record[], head: string): value is Record[] {
  if (!Array.isArray(value) || value.length > MAX_RECORDS || !value.every(validRecord)) return false;
  const existing = new Set(cached.map((record) => record.hash));
  const additions = new Map<string, Record>();
  for (const record of value as Record[]) {
    if (existing.has(record.hash) || additions.has(record.hash)) return false;
    additions.set(record.hash, record);
  }
  const stack = [head];
  const visited = new Set<string>();
  let offset = 0;
  while (stack.length) {
    const current = stack.pop()!;
    if (existing.has(current) || visited.has(current)) continue;
    const record = additions.get(current);
    if (!record || value[offset++] !== record) return false;
    visited.add(current);
    for (let index = record.parents.length - 1; index >= 0; index--) stack.push(record.parents[index]);
  }
  return offset === value.length;
}

function cachedVersionParents(repo: Repository, record: Record): VersionParents | false | undefined {
  const cached = repo.getCache(Ref.from(record.hash)) as Version | undefined;
  if (!cached) return undefined;
  if (
    !versionDefaults ||
    Object.getPrototypeOf(cached) !== versionDefaults.constructor.prototype ||
    ['parents', 'unrelated', 'squashed', '_hash', 'hash'].some(
      (name) => Object.getOwnPropertyDescriptor(cached, name)?.get
    ) ||
    (
      Object.getOwnPropertyDescriptor(cached, 'hash') ||
      Object.getOwnPropertyDescriptor(versionDefaults.constructor.prototype, 'hash')
    )?.value !== versionDefaults.hash ||
    cached._hash !== record.hash ||
    (cached.unrelated && Object.getOwnPropertyDescriptor(cached.unrelated, 'head')?.get) ||
    (cached.squashed && Object.getOwnPropertyDescriptor(cached.squashed, 'previousParents')?.get)
  )
    return false;
  const parents: VersionParents = {
    hash: cached.hash(),
    parents: cached.parents,
    unrelated: cached.unrelated?.head,
    squashed: cached.squashed?.previousParents,
  };
  const actual = project([parents]);
  const expected = {
    hash: record.hash,
    parents: record.parents,
    unrelated: record.unrelated,
    squashed: record.squashed,
  };
  return actual && JSON.stringify(actual[0]) === JSON.stringify(expected) ? parents : false;
}

function validDivergence(data: any, records: Record[], source: string, target: string, unrelated: boolean): boolean {
  if (
    !Array.isArray(data.sourceOnly) ||
    data.sourceOnly.length > MAX_RECORDS ||
    !data.sourceOnly.every(hash) ||
    !Array.isArray(data.targetOnly) ||
    data.targetOnly.length > MAX_RECORDS ||
    !data.targetOnly.every(hash) ||
    (data.common !== undefined && !hash(data.common)) ||
    typeof data.noCommon !== 'boolean'
  )
    return false;
  const known = new Set(
    records.flatMap((record) => [
      record.hash,
      ...record.parents,
      ...(record.squashed || []),
      ...(record.unrelated ? [record.unrelated] : []),
    ])
  );
  const sourceOnly = new Set<string>(data.sourceOnly);
  const targetOnly = new Set<string>(data.targetOnly);
  if (
    sourceOnly.size !== data.sourceOnly.length ||
    targetOnly.size !== data.targetOnly.length ||
    [...sourceOnly].some((entry) => !known.has(entry) || targetOnly.has(entry)) ||
    [...targetOnly].some((entry) => !known.has(entry)) ||
    (data.common !== undefined &&
      (!known.has(data.common) || sourceOnly.has(data.common) || targetOnly.has(data.common)))
  )
    return false;
  if (source === target)
    return !data.noCommon && data.common === source && sourceOnly.size === 0 && targetOnly.size === 0;
  if (data.common !== undefined) return !data.noCommon;
  const allowedUnrelated = unrelated || records.find((record) => record.hash === source)?.unrelated === target;
  return data.noCommon === !allowedUnrelated;
}
