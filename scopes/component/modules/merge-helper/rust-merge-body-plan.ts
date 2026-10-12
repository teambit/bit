import { types } from 'util';
import { AsyncLocalStorage } from 'async_hooks';
import { createHash } from 'crypto';
import type { SourceFile, RustCheckoutPlanSourceDescriptor } from '@teambit/component.sources';
import {
  getRustCheckoutPlanSourceDescriptor,
  installRustCheckoutPlanSourceContents,
  canInstallRustCheckoutPlanSourceContents,
} from '@teambit/component.sources';
import { hasRustSnapshotTransactionClassFields, hasRustSnapshotTransactionClassFieldsBatch } from '@teambit/objects';
import type { Version } from '@teambit/objects';
import type { MergeResultsThreeWay } from './three-way-merge';

export type RustMergeBody = {
  planIndex: number;
  spoolPath: string;
  spoolHash: string;
  bytes: number;
  spoolOffset?: number;
};
export type RustMergeRow = {
  kind: keyof MergeResultsThreeWay;
  current?: number;
  base?: number;
  other?: number;
  bodyPlanIndex?: number;
  outputPlanIndex?: number;
  conflictPlanIndex?: number;
  isBinaryConflict?: boolean;
};
export type RustMergeBodyPlan = {
  ownerToken: string;
  token: string;
  index: number;
  snapshotDirectory: string;
  bodies: RustMergeBody[];
  rows: RustMergeRow[];
  currentFiles: SourceFile[];
  currentRows: Array<
    RustMergeBody & { index: number; relativePath: string; currentHash: string; sharesCurrent: boolean }
  >;
  targetManifest: RustMergeTargetManifest;
  currentClones: SourceFile[];
  /** Exact Buffers returned by the canonical current/Source observation phases. */
  bodyAliases?: Map<string, Buffer>;
  otherAliases?: Map<number, Buffer>;
  valid: () => boolean;
};
type Snapshot = {
  object: object;
  fields: Array<{ key: string | symbol; descriptor: PropertyDescriptor }>;
  prototype: object | null;
};
function descriptorSnapshot(object: object): Snapshot {
  return {
    object,
    fields: Reflect.ownKeys(object).map((key) => ({ key, descriptor: Object.getOwnPropertyDescriptor(object, key)! })),
    prototype: Object.getPrototypeOf(object),
  };
}
const plans = new WeakMap<MergeResultsThreeWay, { plan: RustMergeBodyPlan; snapshots: Snapshot[] }>();
const mergePlanIndices = new AsyncLocalStorage<number>();
export function withRustMergeBodyPlanIndex<T>(index: number, action: () => Promise<T>): Promise<T> {
  return mergePlanIndices.run(index, action);
}
export function getRustMergeBodyPlanIndex(): number | undefined {
  return mergePlanIndices.getStore();
}
const bodySnapshots = new WeakMap<RustMergeBodyPlan, Snapshot[]>();
const equals = Buffer.prototype.equals;
const bodyCreateHash = createHash;
const isBuffer = Buffer.isBuffer;
const typedArrayLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'length')!.get!;
const mapGet = Map.prototype.get;
const allocateSnapshot = Buffer.allocUnsafeSlow;
const setSnapshotBytes = Uint8Array.prototype.set;

/** Private byte copies use captured typed-array intrinsics, never a public Buffer hook. */
export function copyRustMergeBuffer(value: Buffer): Buffer {
  const copy = allocateSnapshot(typedArrayLength.call(value));
  setSnapshotBytes.call(copy, value);
  return copy;
}

const bufferPrototypes: Snapshot[] = [];
const bufferPropertyNames = new Set(['then', '_isBuffer']);
for (let prototype: object | null = Buffer.prototype; prototype; prototype = Object.getPrototypeOf(prototype)) {
  if (prototype !== Object.prototype) bufferPrototypes.push(descriptorSnapshot(prototype));
  Object.getOwnPropertyNames(prototype).forEach((name) => bufferPropertyNames.add(name));
}
const bufferProperties = [...bufferPropertyNames];

/** Check once for a synchronous batch, before any captured Buffer methods execute. */
export function hasRustMergeBufferPrototypes(): boolean {
  return !Object.getOwnPropertyDescriptor(Object.prototype, 'then') && bufferPrototypes.every(unchanged);
}

/** Keep arbitrary metadata on the same alias, but never bypass a byte/serialization hook. */
export function hasRustMergeBufferProperties(value: unknown): value is Buffer {
  if (
    !value ||
    typeof value !== 'object' ||
    types.isProxy(value) ||
    Object.getOwnPropertyDescriptor(Buffer, 'isBuffer')?.value !== isBuffer ||
    !isBuffer(value) ||
    Object.getPrototypeOf(value) !== Buffer.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  )
    return false;
  for (let index = 0; index < bufferProperties.length; index++) {
    if (Object.hasOwn(value, bufferProperties[index])) return false;
  }
  return true;
}

function matchingBodyAlias(value: unknown, body: RustMergeBody): value is Buffer {
  return Boolean(
    hasRustMergeBufferProperties(value) &&
      typedArrayLength.call(value) === body.bytes &&
      Object.getOwnPropertyDescriptor(require('crypto'), 'createHash')?.value === bodyCreateHash &&
      bodyCreateHash('sha1').update(value).digest('hex') === body.spoolHash
  );
}

function observedBodyAlias(plan: RustMergeBodyPlan, index: number, relativePath: string): unknown {
  const aliases = plan.bodyAliases;
  if (
    !aliases ||
    types.isProxy(aliases) ||
    Object.getPrototypeOf(aliases) !== Map.prototype ||
    Reflect.ownKeys(aliases).length ||
    Object.getOwnPropertyDescriptor(Map.prototype, 'get')?.value !== mapGet
  )
    return undefined;
  return mapGet.call(aliases, `${index}:${relativePath}`);
}

function selectedBodyAlias(
  plan: RustMergeBodyPlan,
  file: SourceFile,
  row: {
    planIndex: number;
    relativePath: string;
    aliasKind?: 'target' | 'current' | 'other' | 'new';
    aliasIndex?: number;
  }
): unknown {
  if (row.aliasKind === 'new') return undefined;
  if (row.aliasKind === 'current') {
    const current =
      row.aliasIndex === undefined
        ? undefined
        : Object.getOwnPropertyDescriptor(plan.currentClones, String(row.aliasIndex))?.value;
    return (
      current &&
      (Object.getOwnPropertyDescriptor(current, '_contents')?.value ??
        Object.getOwnPropertyDescriptor(current, 'contents')?.value)
    );
  }
  if (row.aliasKind === 'other') {
    const aliases = plan.otherAliases;
    if (
      !aliases ||
      types.isProxy(aliases) ||
      Object.getPrototypeOf(aliases) !== Map.prototype ||
      Reflect.ownKeys(aliases).length ||
      Object.getOwnPropertyDescriptor(Map.prototype, 'get')?.value !== mapGet
    )
      return undefined;
    return mapGet.call(aliases, row.aliasIndex);
  }
  if (row.aliasKind === 'target')
    return (
      Object.getOwnPropertyDescriptor(file, '_contents')?.value ??
      Object.getOwnPropertyDescriptor(file, 'contents')?.value
    );
  return observedBodyAlias(plan, row.planIndex, row.relativePath);
}

function unchanged(snapshot: Snapshot): boolean {
  if (
    types.isProxy(snapshot.object) ||
    Object.getPrototypeOf(snapshot.object) !== snapshot.prototype ||
    Reflect.ownKeys(snapshot.object).length !== snapshot.fields.length
  )
    return false;
  for (let index = 0; index < snapshot.fields.length; index++) {
    const { key, descriptor: saved } = snapshot.fields[index];
    const live = Object.getOwnPropertyDescriptor(snapshot.object, key);
    if (
      !live ||
      live.value !== saved.value ||
      live.get !== saved.get ||
      live.set !== saved.set ||
      live.writable !== saved.writable ||
      live.enumerable !== saved.enumerable ||
      live.configurable !== saved.configurable
    )
      return false;
  }
  return true;
}

/** Record only our assembled public rows, including exact private lazy getter identities. */
export function rememberRustMergeResultBodyPlan(results: MergeResultsThreeWay, plan: RustMergeBodyPlan): void {
  const snapshots: Snapshot[] = [descriptorSnapshot(results)];
  for (const array of [plan.rows, plan.currentRows, plan.currentFiles, plan.currentClones]) {
    snapshots.push(descriptorSnapshot(array));
    for (const row of array) snapshots.push(descriptorSnapshot(row));
  }
  for (const key of Reflect.ownKeys(results)) {
    const value = Object.getOwnPropertyDescriptor(results, key)?.value;
    if (!Array.isArray(value)) continue;
    snapshots.push(descriptorSnapshot(value));
    for (let index = 0; index < value.length; index++) {
      const row = Object.getOwnPropertyDescriptor(value, String(index))?.value;
      if (row && typeof row === 'object') snapshots.push(descriptorSnapshot(row));
    }
  }
  const bodies = plan.currentClones.map((file) => {
    const body =
      Object.getOwnPropertyDescriptor(file, '_contents')?.value ??
      Object.getOwnPropertyDescriptor(file, 'contents')?.value;
    return hasRustMergeBufferProperties(body) ? { file, body, copy: copyRustMergeBuffer(body) } : undefined;
  });
  const metadata: Snapshot[] = [descriptorSnapshot(plan.bodies), ...plan.bodies.map(descriptorSnapshot)];
  const valid = plan.valid;
  const guarded = {
    ...plan,
    valid: () =>
      hasRustMergeBufferPrototypes() &&
      bodies.every((saved) => saved && hasRustMergeBufferProperties(saved.body)) &&
      valid() &&
      metadata.every(unchanged) &&
      snapshots.every(unchanged) &&
      bodies.every((saved) => {
        if (!saved || types.isProxy(saved.file)) return false;
        const body =
          Object.getOwnPropertyDescriptor(saved.file, '_contents')?.value ??
          Object.getOwnPropertyDescriptor(saved.file, 'contents')?.value;
        return (
          body === saved.body &&
          Object.getOwnPropertyDescriptor(Buffer.prototype, 'equals')?.value === equals &&
          equals.call(body, saved.copy)
        );
      }),
  };
  snapshots.push(descriptorSnapshot(guarded));
  bodySnapshots.set(guarded, metadata);
  plans.set(results, { plan: guarded, snapshots });
}

/** Late Native Apply may extend the retained plan; callers cannot mutate already captured body records. */
export function appendRustMergeBodyPlanBodies(results: MergeResultsThreeWay, additions: RustMergeBody[]): boolean {
  const plan = getRustMergeResultBodyPlan(results);
  return plan ? appendPlanBodies(plan, additions) : false;
}

function appendPlanBodies(plan: RustMergeBodyPlan, additions: RustMergeBody[]): boolean {
  const snapshots = bodySnapshots.get(plan);
  if (
    !plan ||
    !snapshots ||
    !hasRustSnapshotTransactionClassFields(additions, 'Array', []) ||
    additions.length + plan.bodies.length > 4096
  )
    return false;
  const copies: RustMergeBody[] = [];
  const indices = new Set(plan.bodies.map((body) => body.planIndex));
  for (let index = 0; index < additions.length; index++) {
    const row = Object.getOwnPropertyDescriptor(additions, String(index))?.value;
    if (!row || types.isProxy(row) || Object.getPrototypeOf(row) !== Object.prototype) return false;
    const fields = Object.getOwnPropertyDescriptors(row);
    if (
      Reflect.ownKeys(fields).length !== (fields.spoolOffset ? 5 : 4) ||
      (fields.spoolOffset && !('value' in fields.spoolOffset)) ||
      ['planIndex', 'spoolPath', 'spoolHash', 'bytes'].some((key) => !fields[key] || !('value' in fields[key]))
    )
      return false;
    const { planIndex, spoolPath, spoolHash, bytes, spoolOffset } = row;
    if (
      !Number.isInteger(planIndex) ||
      planIndex < 0 ||
      planIndex >= 4096 ||
      indices.has(planIndex) ||
      typeof spoolPath !== 'string' ||
      typeof spoolHash !== 'string' ||
      !/^[a-f0-9]{40}$/.test(spoolHash) ||
      !Number.isSafeInteger(bytes) ||
      bytes < 0 ||
      (spoolOffset !== undefined &&
        (!Number.isSafeInteger(spoolOffset) || spoolOffset < 0 || spoolOffset + bytes > 32 * 1024 * 1024))
    )
      return false;
    indices.add(planIndex);
    copies.push({ planIndex, spoolPath, spoolHash, bytes, ...(spoolOffset === undefined ? {} : { spoolOffset }) });
  }
  plan.bodies.push(...copies);
  snapshots.splice(0, snapshots.length, descriptorSnapshot(plan.bodies), ...plan.bodies.map(descriptorSnapshot));
  return true;
}

export function getRustMergeResultBodyPlan(results?: MergeResultsThreeWay | null): RustMergeBodyPlan | undefined {
  if (!results || types.isProxy(results)) return undefined;
  const saved = plans.get(results);
  return saved?.plan.valid() ? saved.plan : undefined;
}

export function rustMergeBodyDescriptor(
  plan: RustMergeBodyPlan,
  body: RustMergeBody
): RustCheckoutPlanSourceDescriptor {
  return {
    token: plan.token,
    planIndex: body.planIndex,
    snapshotPath: body.spoolPath,
    ...(body.spoolOffset === undefined ? {} : { snapshotOffset: body.spoolOffset }),
    snapshotHash: body.spoolHash,
    bytes: body.bytes,
    mergeOwnerToken: plan.ownerToken,
  };
}

type BodySelection = {
  files: Array<{
    index: number;
    planIndex: number;
    relativePath: string;
    aliasKind?: 'target' | 'current' | 'other' | 'new';
    aliasIndex?: number;
  }>;
};
type AppliedBodySelection = BodySelection['files'][number] & {
  kind: 'target' | 'current' | 'other';
  finalIndex: number;
};

/** Read retained public rows and attach bodies within one synchronous freshness boundary. */
export function assembleRustMergeResultBodies(
  results: MergeResultsThreeWay,
  expected: RustMergeBodyPlan,
  clones: SourceFile[],
  selections: AppliedBodySelection[],
  additions: RustMergeBody[]
): SourceFile[] | undefined {
  const plan = getRustMergeResultBodyPlan(results);
  if (!plan || plan !== expected || !hasRustSnapshotTransactionClassFields(clones, 'Array', [])) return undefined;
  const sourcesByPath = new Map<string, SourceFile>();
  for (const rows of [
    results.modifiedFiles,
    results.addFiles,
    results.deletedConflictFiles,
    results.unModifiedFiles,
    results.overrideFiles,
  ]) {
    for (const row of rows) {
      if ('fsFile' in row && row.fsFile && !sourcesByPath.has(row.filePath))
        sourcesByPath.set(row.filePath, row.fsFile);
    }
  }
  const selected: SourceFile[] = [];
  for (const row of selections) {
    const file =
      row.kind === 'target'
        ? Object.getOwnPropertyDescriptor(clones, String(row.index))?.value
        : sourcesByPath.get(row.relativePath);
    if (!file) return undefined;
    selected.push(file);
  }
  const selection = { files: selections.map((row) => ({ ...row, index: row.finalIndex })) };
  return attachPlanBodies(plan, selected, selection, additions) ? selected : undefined;
}

/** The caller already executed clone/apply callbacks; preserve their exact returned SourceFile instances. */
export function attachRustMergeResultBodies(
  results: MergeResultsThreeWay,
  files: SourceFile[],
  selection: BodySelection,
  additions: RustMergeBody[] = []
): boolean {
  const plan = getRustMergeResultBodyPlan(results);
  return Boolean(plan && attachPlanBodies(plan, files, selection, additions));
}

function attachPlanBodies(
  plan: RustMergeBodyPlan,
  files: SourceFile[],
  selection: BodySelection,
  additions: RustMergeBody[]
): boolean {
  if (
    !plan ||
    !hasRustSnapshotTransactionClassFields(files, 'Array', []) ||
    files.length > 4096 ||
    !hasRustSnapshotTransactionClassFieldsBatch(files, 'SourceFile', [
      'history',
      '_base',
      '_cwd',
      'base',
      'path',
      'relative',
    ]) ||
    !appendPlanBodies(plan, additions)
  )
    return false;
  const patches: Array<{ file: SourceFile; body: RustMergeBody; alias?: Buffer }> = [];
  const bodiesByIndex = new Map(plan.bodies.map((body) => [body.planIndex, body]));
  for (const row of selection.files) {
    const file = Object.getOwnPropertyDescriptor(files, String(row.index))?.value;
    const body = bodiesByIndex.get(row.planIndex);
    if (!file || !body || types.isProxy(file)) return false;
    const owned = getRustCheckoutPlanSourceDescriptor(file);
    const alias =
      Object.getOwnPropertyDescriptor(file, '_contents')?.value ??
      Object.getOwnPropertyDescriptor(file, 'contents')?.value;
    if (!owned && alias !== undefined && !Buffer.isBuffer(alias)) return false;
    const observed = selectedBodyAlias(plan, file, row);
    // Canonical updated/binary/current rows share their observed Source Buffer, including unowned aliases.
    const retained =
      row.aliasKind === 'new'
        ? undefined
        : matchingBodyAlias(observed, body)
          ? observed
          : row.aliasKind === 'current' || row.aliasKind === 'other'
            ? undefined
            : matchingBodyAlias(alias, body)
              ? alias
              : undefined;
    if ((row.aliasKind === 'current' || row.aliasKind === 'other') && retained === undefined) return false;
    if (file.relative.replace(/\\/g, '/') !== row.relativePath) return false;
    patches.push({ file, body, ...(retained === undefined ? {} : { alias: retained }) });
  }
  if (
    !patches.every(({ file, body, alias }) =>
      canInstallRustCheckoutPlanSourceContents(file, rustMergeBodyDescriptor(plan, body), alias)
    )
  )
    return false;
  for (const { file, body, alias } of patches) {
    if (!installRustCheckoutPlanSourceContents(file, rustMergeBodyDescriptor(plan, body), alias)) {
      throw new Error('unable to attach a prevalidated native merge body');
    }
  }
  return true;
}

export type RustMergeTargetManifest = {
  hash: string;
  files: Array<{ hash: string; relativePath: string; name?: string; test?: boolean }>;
};
export function captureNativeMergeTarget(
  version: Version
): { manifest: RustMergeTargetManifest; fresh: () => boolean } | undefined {
  if (types.isProxy(version) || !hasRustSnapshotTransactionClassFields(version, 'Version', ['_hash', 'files']))
    return undefined;
  const fields = Object.getOwnPropertyDescriptors(version);
  const hash = fields._hash?.value;
  const files = fields.files?.value;
  if (
    typeof hash !== 'string' ||
    !/^[a-f0-9]{40}$/.test(hash) ||
    !Array.isArray(files) ||
    !hasRustSnapshotTransactionClassFields(files, 'Array', []) ||
    files.length > 4096
  )
    return undefined;
  const arrayFields = Object.getOwnPropertyDescriptors(files);
  if (Reflect.ownKeys(arrayFields).length !== files.length + 1) return undefined;
  const snapshots: Snapshot[] = [descriptorSnapshot(files)];
  const output: RustMergeTargetManifest['files'] = [];
  const references: object[] = [];
  for (let index = 0; index < files.length; index++) {
    const row = arrayFields[index]?.value;
    if (!row || types.isProxy(row) || Object.getPrototypeOf(row) !== Object.prototype) return undefined;
    const data = Object.getOwnPropertyDescriptors(row);
    if (Reflect.ownKeys(data).some((key) => !('value' in Reflect.get(data, key)))) return undefined;
    const reference = data.file?.value;
    if (!reference || typeof reference !== 'object' || types.isProxy(reference)) return undefined;
    references.push(reference);
    const fileHash = Object.getOwnPropertyDescriptor(reference, 'hash')?.value;
    const relativePath = data.relativePath?.value,
      name = data.name?.value,
      test = data.test?.value;
    if (
      typeof fileHash !== 'string' ||
      !/^[a-f0-9]{40}$/.test(fileHash) ||
      typeof relativePath !== 'string' ||
      (name !== undefined && typeof name !== 'string') ||
      (test !== undefined && typeof test !== 'boolean')
    )
      return undefined;
    output[index] = {
      hash: fileHash,
      relativePath,
      ...(name === undefined ? {} : { name }),
      ...(test === undefined ? {} : { test }),
    };
    snapshots.push(descriptorSnapshot(row), descriptorSnapshot(reference));
  }
  if (!hasRustSnapshotTransactionClassFieldsBatch(references, 'Ref', ['hash'])) return undefined;
  return {
    manifest: { hash, files: output },
    fresh: () =>
      hasRustSnapshotTransactionClassFields(version, 'Version', ['_hash', 'files']) &&
      hasRustSnapshotTransactionClassFields(files, 'Array', []) &&
      Object.getOwnPropertyDescriptor(version, '_hash')?.value === hash &&
      Object.getOwnPropertyDescriptor(version, 'files')?.value === files &&
      snapshots.every(unchanged) &&
      hasRustSnapshotTransactionClassFieldsBatch(references, 'Ref', ['hash']),
  };
}
