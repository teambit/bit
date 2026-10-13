import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { AsyncLocalStorage } from 'async_hooks';
import type { Repository, Ref, SourceFileModel, Version } from '@teambit/objects';
import {
  canReadRustCheckoutRepository,
  hasRustSnapshotTransactionClass,
  hasRustSnapshotTransactionClassFields,
  registerRustSnapshotFunctions,
  hasRustSnapshotFunctions,
  registerRustSnapshotFunctionReference,
  hasRustSnapshotFunctionReference,
} from '@teambit/objects';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import {
  SourceFile,
  getRustWorkspaceMergeDescriptor,
  createRustCheckoutPlanSourceFile,
  getRustCheckoutPlanSourceDescriptor,
  registerRustWorkspaceEngineCleanup,
  isRustWorkspaceEngine,
} from '@teambit/component.sources';
import { pathNormalizeToLinux } from '@teambit/legacy.utils';
import { canUseDefaultGitNatively } from '@teambit/git.modules.git-executable';
import { requestRustCheckout, canTransportRustCheckout } from './rust-checkout-transition';
import * as eol from '@teambit/toolbox.string.eol';
import type { MergeResultsThreeWay } from '@teambit/component.modules.merge-helper';

// Babel index re-exports are accessors. Capture their descriptors without invoking them.
// Function-reference registrations retain the original accessor across adapter reloads.
const exportDomains: Array<{ name: string; object: object; key: string; descriptor: PropertyDescriptor }> = [];
let lfGuard: typeof eol.captureDefaultEolLf | undefined;
function registerExportDomain(name: string, object: object, key: string, dataOnly = false): void {
  if (exportDomains.some((entry) => entry.name === name)) return;
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  const reference = descriptor?.get || descriptor?.value;
  if (!descriptor || (dataOnly && !('value' in descriptor)) || typeof reference !== 'function') return;
  registerRustSnapshotFunctionReference(name, reference);
  exportDomains.push({ name, object, key, descriptor });
}
function exportsAvailable(): boolean {
  return (
    exportDomains.length === 8 &&
    exportDomains.every(({ name, object, key, descriptor }) => {
      const live = Object.getOwnPropertyDescriptor(object, key);
      return Boolean(
        live &&
          live.get === descriptor.get &&
          live.set === descriptor.set &&
          live.value === descriptor.value &&
          live.writable === descriptor.writable &&
          live.enumerable === descriptor.enumerable &&
          live.configurable === descriptor.configurable &&
          hasRustSnapshotFunctionReference(name, live.get || live.value)
      );
    })
  );
}

export function registerRustCheckoutFileFunctions(): void {
  registerRustSnapshotFunctions('CheckoutPlanFS', fs, ['mkdtemp', 'readFileSync', 'remove']);
  registerRustSnapshotFunctions('CheckoutPlanPath', path, ['join', 'resolve', 'dirname', 'normalize']);
  registerExportDomain('CheckoutPlanEolExport', require('@teambit/toolbox.string.eol'), 'lf');
  registerExportDomain('CheckoutPlanEolGuardExport', require('@teambit/toolbox.string.eol'), 'captureDefaultEolLf');
  registerRustSnapshotFunctions('CheckoutPlanOS', os, ['tmpdir']);
  registerExportDomain('CheckoutPlanLegacyPathExport', require('@teambit/legacy.utils'), 'pathNormalizeToLinux');
  registerExportDomain(
    'CheckoutPlanGitExport',
    require('@teambit/git.modules.git-executable'),
    'canUseDefaultGitNatively'
  );
  const definingEol = require('@teambit/toolbox.string.eol/dist/eol.js');
  registerExportDomain('CheckoutPlanDefiningLf', definingEol, 'lf', true);
  registerExportDomain('CheckoutPlanDefiningLfGuard', definingEol, 'captureDefaultEolLf', true);
  registerExportDomain(
    'CheckoutPlanDefiningNormalize',
    require('@teambit/toolbox.path.path/dist/path.js'),
    'pathNormalizeToLinux',
    true
  );
  registerExportDomain(
    'CheckoutPlanDefiningGitGuard',
    require('@teambit/git.modules.git-executable/dist/git-executable.js'),
    'canUseDefaultGitNatively',
    true
  );
  if (!exportsAvailable()) return;
  lfGuard ||= Object.getOwnPropertyDescriptor(definingEol, 'captureDefaultEolLf')!.value;
  registerRustSnapshotFunctionReference('CheckoutPlanLf', eol.lf);
  registerRustSnapshotFunctionReference('CheckoutPlanNormalize', pathNormalizeToLinux);
  registerRustSnapshotFunctionReference('CheckoutPlanGitGuard', canUseDefaultGitNatively);
}

export function canUseRustCheckoutFileFunctions(): boolean {
  return (
    exportsAvailable() &&
    Boolean(lfGuard?.()) &&
    hasRustSnapshotFunctions(['CheckoutPlanFS', 'CheckoutPlanPath', 'CheckoutPlanOS']) &&
    hasRustSnapshotFunctionReference('CheckoutPlanLf', eol.lf) &&
    hasRustSnapshotFunctionReference('CheckoutPlanNormalize', pathNormalizeToLinux) &&
    hasRustSnapshotFunctionReference('CheckoutPlanGitGuard', canUseDefaultGitNatively)
  );
}

export type CheckoutBody = { planIndex: number; spoolPath: string; spoolHash: string; bytes: number };
type TargetFile = CheckoutBody & { index: number; relativePath: string; hash: string };
type CurrentFile = CheckoutBody & { index: number; relativePath: string; currentHash: string; sharesCurrent: boolean };
export type CheckoutMergeRow = {
  kind:
    | 'modifiedFiles'
    | 'addFiles'
    | 'deletedConflictFiles'
    | 'removeFiles'
    | 'remainDeletedFiles'
    | 'unModifiedFiles'
    | 'updatedFiles';
  current?: number;
  base?: number;
  other?: number;
  bodyPlanIndex?: number;
  outputPlanIndex?: number;
  conflictPlanIndex?: number;
  isBinaryConflict?: boolean;
};
type Status = { relativePath: string; status: 'updated' | 'unchanged' | 'removed' };
type FilesPlan = {
  token: string;
  hasConflicts: boolean;
  targetFiles: TargetFile[];
  currentFiles: CurrentFile[];
  bodies: CheckoutBody[];
  mergeRows: CheckoutMergeRow[];
  statuses: Status[];
  removals: string[];
};
type Manifest = { hash: string; relativePath: string; name?: string; test?: boolean };
type Current = {
  readToken?: number;
  relativePath: string;
  path: string;
  rawHash: string;
  snapshotHash: string;
  protected: boolean;
  bitmap?: boolean;
};
export type PreparedCheckoutFiles = {
  plan: FilesPlan;
  currentFiles: SourceFile[];
  targetModels: SourceFileModel[];
  baseModels: SourceFileModel[];
  valid: () => boolean;
  repository: Repository;
};
const mergePlans = new WeakMap<MergeResultsThreeWay, PreparedCheckoutFiles>();
const targetManifests = new WeakMap<PreparedCheckoutFiles, { hash: string; files: Manifest[] }>();
const mergeSnapshots = new WeakMap<MergeResultsThreeWay, Array<{ object: object; fields: PropertyDescriptorMap }>>();
const mergeBodies = new WeakMap<MergeResultsThreeWay, SourceFile[]>();
const mergeCurrentBodies = new WeakMap<MergeResultsThreeWay, Array<{ file: SourceFile; body: Buffer; copy: Buffer }>>();
const checkoutTokens = new AsyncLocalStorage<Set<string>>();

/** Retain all private plans through callbacks and writers, then release only native state. */
export function withRustCheckoutPlans<T>(action: () => Promise<T>): Promise<T> {
  if (checkoutTokens.getStore() || !isRustWorkspaceEngine()) return action();
  return checkoutTokens.run(new Set(), async () => {
    try {
      return await action();
    } finally {
      for (const token of checkoutTokens.getStore()!) {
        if (!isRustWorkspaceEngine()) break;
        await requestRustCheckout<{ finished: true }>(
          { kind: 'checkoutFinish', token },
          (value): value is { finished: true } => value?.finished === true
        ).catch(() => undefined);
      }
    }
  });
}

const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
function dense(value: any): value is any[] {
  if (!hasRustSnapshotTransactionClass(value, 'Array') || value.length > 4096) return false;
  const fields = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(fields);
  return (
    keys.length === value.length + 1 &&
    keys.every(
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

function manifest(
  version: Version,
  merging = false
): { hash: string; files: Manifest[]; refs: Ref[]; models: SourceFileModel[] } | undefined {
  if (!hasRustSnapshotTransactionClassFields(version, 'Version', ['_hash', 'files'])) return undefined;
  const versionHash = Object.getOwnPropertyDescriptor(version, '_hash')?.value;
  const models = Object.getOwnPropertyDescriptor(version, 'files')?.value;
  if (!hash(versionHash) || !dense(models)) return undefined;
  const files: Manifest[] = [];
  const refs: Ref[] = [];
  for (const model of models) {
    if (!model || Object.getPrototypeOf(model) !== Object.prototype) return undefined;
    const fields = Object.getOwnPropertyDescriptors(model);
    if (merging && (fields.label ? !('value' in fields.label) || !fields.label.writable : !Object.isExtensible(model)))
      return undefined;
    if (['file', 'relativePath', 'name', 'test'].some((name) => fields[name] && !('value' in fields[name])))
      return undefined;
    const reference = fields.file?.value;
    const fileHash = reference && Object.getOwnPropertyDescriptor(reference, 'hash')?.value;
    if (
      !hasRustSnapshotTransactionClassFields(reference, 'Ref', ['hash']) ||
      !hash(fileHash) ||
      typeof fields.relativePath?.value !== 'string' ||
      (fields.name?.value !== undefined && typeof fields.name.value !== 'string') ||
      (fields.test?.value !== undefined && typeof fields.test.value !== 'boolean')
    )
      return undefined;
    files.push({
      hash: fileHash,
      relativePath: fields.relativePath.value,
      name: fields.name?.value,
      test: fields.test?.value,
    });
    refs.push(reference);
  }
  return { hash: versionHash, files, refs, models: models.slice() };
}

function current(component?: ConsumerComponent): { files: SourceFile[]; rows: Current[] } | undefined {
  if (!component) return { files: [], rows: [] };
  if (!hasRustSnapshotTransactionClassFields(component, 'ConsumerComponent', ['files', 'componentMap']))
    return undefined;
  const files = Object.getOwnPropertyDescriptor(component, 'files')?.value;
  if (!dense(files)) return undefined;
  const rows: Current[] = [];
  for (const file of files) {
    if (!hasRustSnapshotTransactionClass(file, 'SourceFile')) return undefined;
    const history = Object.getOwnPropertyDescriptor(file, 'history')?.value;
    if (!dense(history) || !history.every((entry) => typeof entry === 'string')) return undefined;
    const descriptor = getRustWorkspaceMergeDescriptor(file, true);
    if (!descriptor || !hash(descriptor.snapshotHash)) return undefined;
    rows.push({
      relativePath: pathNormalizeToLinux(file.relative),
      path: descriptor.path,
      rawHash: descriptor.hash,
      snapshotHash: descriptor.snapshotHash,
      protected: false,
      ...(descriptor.bitmap ? { bitmap: true } : {}),
      ...(descriptor.readToken === undefined ? {} : { readToken: descriptor.readToken }),
    });
  }
  return { files: files.slice(), rows };
}

function body(value: any, directory: string): boolean {
  return (
    value &&
    Number.isSafeInteger(value.planIndex) &&
    value.planIndex >= 0 &&
    value.planIndex < 4096 &&
    typeof value.spoolPath === 'string' &&
    path.dirname(value.spoolPath) === directory &&
    hash(value.spoolHash) &&
    Number.isSafeInteger(value.bytes) &&
    value.bytes >= 0 &&
    value.bytes <= 32 * 1024 * 1024
  );
}

function validPlan(
  value: any,
  directory: string,
  targets: Manifest[],
  currents: Current[],
  bases: Manifest[]
): value is FilesPlan {
  if (
    !value ||
    !hash(value.token) ||
    typeof value.hasConflicts !== 'boolean' ||
    !Array.isArray(value.bodies) ||
    value.bodies.length > 4096 ||
    !value.bodies.every((row) => body(row, directory)) ||
    !Array.isArray(value.targetFiles) ||
    value.targetFiles.length !== targets.length ||
    !Array.isArray(value.currentFiles) ||
    value.currentFiles.length !== currents.length ||
    !Array.isArray(value.mergeRows) ||
    value.mergeRows.length > 12288 ||
    !Array.isArray(value.statuses) ||
    !Array.isArray(value.removals) ||
    value.removals.length
  )
    return false;
  const indices = new Set(value.bodies.map((row) => row.planIndex));
  if (indices.size !== value.bodies.length) return false;
  if (
    !value.targetFiles.every(
      (row, index) =>
        body(row, directory) &&
        row.index === index &&
        row.relativePath === targets[index].relativePath &&
        row.hash === targets[index].hash &&
        indices.has(row.planIndex)
    )
  )
    return false;
  if (
    !value.currentFiles.every(
      (row, index) =>
        body(row, directory) &&
        row.index === index &&
        row.relativePath === currents[index].relativePath &&
        hash(row.currentHash) &&
        typeof row.sharesCurrent === 'boolean' &&
        indices.has(row.planIndex)
    )
  )
    return false;
  const kinds = [
    'modifiedFiles',
    'addFiles',
    'deletedConflictFiles',
    'removeFiles',
    'remainDeletedFiles',
    'unModifiedFiles',
    'updatedFiles',
  ];
  return value.mergeRows.every(
    (row) =>
      row &&
      kinds.includes(row.kind) &&
      (row.current === undefined ||
        (Number.isSafeInteger(row.current) && row.current >= 0 && row.current < currents.length)) &&
      (row.base === undefined || (Number.isSafeInteger(row.base) && row.base >= 0 && row.base < bases.length)) &&
      (row.other === undefined || (Number.isSafeInteger(row.other) && row.other >= 0 && row.other < targets.length)) &&
      ['bodyPlanIndex', 'outputPlanIndex', 'conflictPlanIndex'].every(
        (field) => row[field] === undefined || indices.has(row[field])
      )
  );
}

/** Fresh verified body snapshots are private until checkout reaches the canonical removal/write boundary. */
export async function prepareRustCheckoutFiles(
  repository: Repository,
  targetVersion: Version,
  currentComponent?: ConsumerComponent,
  baseVersion?: Version,
  labels?: { current: string; other: string }
): Promise<PreparedCheckoutFiles | undefined> {
  if (
    !isRustWorkspaceEngine() ||
    !canTransportRustCheckout() ||
    !canUseRustCheckoutFileFunctions() ||
    (baseVersion && !canUseDefaultGitNatively())
  )
    return undefined;
  const target = manifest(targetVersion, Boolean(baseVersion));
  const base = baseVersion ? manifest(baseVersion) : undefined;
  const fromFs = current(currentComponent);
  if (!target || (baseVersion && !base) || !fromFs) return undefined;
  const refs = [...target.refs, ...(base?.refs || [])];
  if (!canReadRustCheckoutRepository(repository, refs)) return undefined;
  const objectsDirectory = repository.getPath();
  const snapshot = JSON.stringify({ target: target.files, base: base?.files, current: fromFs.rows });
  const valid = () => {
    if (
      !canTransportRustCheckout() ||
      !canUseRustCheckoutFileFunctions() ||
      (baseVersion && !canUseDefaultGitNatively())
    )
      return false;
    const liveTarget = manifest(targetVersion, Boolean(baseVersion));
    const liveBase = baseVersion ? manifest(baseVersion) : undefined;
    const liveFs = current(currentComponent);
    return Boolean(
      liveTarget &&
        (!baseVersion || liveBase) &&
        liveFs &&
        canReadRustCheckoutRepository(repository, refs) &&
        repository.getPath() === objectsDirectory &&
        liveTarget.hash === target.hash &&
        liveTarget.models.every((row, index) => row === target.models[index]) &&
        (!base ||
          (liveBase?.hash === base.hash && liveBase.models.every((row, index) => row === base.models[index]))) &&
        liveFs.files.every((file, index) => file === fromFs.files[index]) &&
        JSON.stringify({ target: liveTarget.files, base: liveBase?.files, current: liveFs.rows }) === snapshot
    );
  };
  let directory: string;
  try {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-checkout-'));
  } catch {
    return undefined;
  }
  registerRustWorkspaceEngineCleanup(() => fs.remove(directory));
  if (!valid()) return undefined;
  const plan = await requestRustCheckout<FilesPlan>(
    {
      kind: 'checkoutPrepare',
      objectsDirectory,
      snapshotDirectory: directory,
      target: { hash: target.hash, files: target.files },
      current: fromFs.rows,
      ...(base ? { base: { hash: base.hash, files: base.files }, labels } : {}),
    },
    (value): value is FilesPlan => validPlan(value, directory, target.files, fromFs.rows, base?.files || [])
  );
  if (plan) checkoutTokens.getStore()?.add(plan.token);
  if (!plan || !valid()) return undefined;
  const prepared = {
    plan,
    currentFiles: fromFs.files,
    targetModels: target.models,
    baseModels: base?.models || [],
    valid,
    repository,
  };
  targetManifests.set(prepared, { hash: target.hash, files: target.files });
  return prepared;
}

/** Separate canonical Version hydrations may share verified content without sharing row objects. */
export function checkoutPlanMatchesVersion(prepared: PreparedCheckoutFiles, version: Version): boolean {
  if (!canTransportRustCheckout() || !canUseRustCheckoutFileFunctions()) return false;
  const expected = targetManifests.get(prepared);
  const live = manifest(version);
  return Boolean(
    expected &&
      live &&
      live.hash === expected.hash &&
      live.files.length === expected.files.length &&
      live.files.every((row, index) => {
        const before = expected.files[index];
        return (
          row.hash === before.hash &&
          row.relativePath === before.relativePath &&
          row.name === before.name &&
          row.test === before.test
        );
      })
  );
}

export function checkoutPlanFile(
  template: SourceFile,
  prepared: PreparedCheckoutFiles,
  row: CheckoutBody,
  contentsAlias?: Buffer
): SourceFile | undefined {
  return createRustCheckoutPlanSourceFile(
    template,
    {
      token: prepared.plan.token,
      planIndex: row.planIndex,
      snapshotPath: row.spoolPath,
      snapshotHash: row.spoolHash,
      bytes: row.bytes,
    },
    contentsAlias
  );
}

export function getPreparedCheckoutMerge(results?: MergeResultsThreeWay | null): PreparedCheckoutFiles | undefined {
  if (!results) return undefined;
  if (
    !mergeCurrentBodies
      .get(results)
      ?.every(
        ({ file, body: contents, copy }) =>
          (Object.getOwnPropertyDescriptor(file, '_contents')?.value ??
            Object.getOwnPropertyDescriptor(file, 'contents')?.value) === contents && contents.equals(copy)
      )
  )
    return undefined;
  if (!mergeBodies.get(results)?.every((file) => Boolean(getRustCheckoutPlanSourceDescriptor(file)))) return undefined;
  const snapshots = mergeSnapshots.get(results);
  if (
    !snapshots ||
    !snapshots.every(({ object, fields }) => {
      const live = Object.getOwnPropertyDescriptors(object);
      return (
        Reflect.ownKeys(live).length === Reflect.ownKeys(fields).length &&
        Reflect.ownKeys(fields).every((key) => {
          const before = Reflect.get(fields, key);
          const after = Reflect.get(live, key);
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
    })
  )
    return undefined;
  return mergePlans.get(results);
}

function bodyFile(prepared: PreparedCheckoutFiles, index: number, alias?: Buffer): SourceFile {
  const row = prepared.plan.bodies.find((candidate) => candidate.planIndex === index);
  if (!row) throw new Error('checkout body selector is missing');
  const template = new SourceFile({ base: '.', path: 'checkout-body', contents: Buffer.alloc(0) });
  const file = checkoutPlanFile(template, prepared, row, alias);
  if (!file) throw new Error('checkout body snapshot is unavailable');
  return file;
}

/** Public rows retain ordinary class aliases; output strings hydrate only for compatibility consumers. */
export function checkoutMergeResults(
  prepared: PreparedCheckoutFiles,
  component: ConsumerComponent,
  labels: { current: string; other: string }
): MergeResultsThreeWay {
  const clones = component.cloneFilesWithSharedDir();
  clones.forEach((file) => {
    file.contents = eol.lf(file.contents) as Buffer;
  });
  const results: MergeResultsThreeWay = {
    addFiles: [],
    removeFiles: [],
    remainDeletedFiles: [],
    deletedConflictFiles: [],
    modifiedFiles: [],
    unModifiedFiles: [],
    overrideFiles: [],
    updatedFiles: [],
    hasConflicts: prepared.plan.hasConflicts,
  };
  const bodies = new Map<number, SourceFile>();
  const capturedBody = (index: number, alias?: Buffer) => {
    let file = bodies.get(index);
    if (!file) {
      file = bodyFile(prepared, index, alias);
      bodies.set(index, file);
    }
    return file;
  };
  const lazyValue = (owner: object, field: string, get: () => unknown) =>
    Object.defineProperty(owner, field, {
      enumerable: true,
      configurable: true,
      get,
      set(value) {
        mergePlans.delete(results);
        Object.defineProperty(owner, field, { enumerable: true, configurable: true, writable: true, value });
      },
    });
  for (const row of prepared.plan.mergeRows) {
    const fsFile = row.current === undefined ? undefined : clones[row.current];
    const otherFile = row.other === undefined ? undefined : prepared.targetModels[row.other];
    const filePath = fsFile
      ? pathNormalizeToLinux(fsFile.relative)
      : (otherFile || prepared.baseModels[row.base!]).relativePath;
    if (row.kind === 'addFiles' || (row.kind === 'deletedConflictFiles' && row.bodyPlanIndex !== undefined)) {
      let loaded = fsFile;
      if (!loaded) {
        const template = new SourceFile({
          base: '.',
          path: filePath,
          contents: Buffer.alloc(0),
          test: otherFile!.test,
        });
        const descriptor = prepared.plan.bodies.find((entry) => entry.planIndex === row.bodyPlanIndex)!;
        const cached = prepared.repository.getCache(otherFile!.file);
        const alias = cached && Object.getOwnPropertyDescriptor(cached, 'contents')?.value;
        loaded = checkoutPlanFile(template, prepared, descriptor, Buffer.isBuffer(alias) ? alias : undefined);
        if (!loaded) throw new Error('checkout added-file snapshot is unavailable');
      }
      results[row.kind].push({ filePath, fsFile: loaded });
    } else if (row.kind === 'updatedFiles') {
      const updated = { filePath, otherFile: otherFile! } as MergeResultsThreeWay['updatedFiles'][number];
      const cached = prepared.repository.getCache(otherFile!.file);
      const alias = cached && Object.getOwnPropertyDescriptor(cached, 'contents')?.value;
      const source = capturedBody(row.bodyPlanIndex!, Buffer.isBuffer(alias) ? alias : undefined);
      lazyValue(updated, 'content', () => source.contents);
      results.updatedFiles.push(updated);
    } else if (row.kind === 'modifiedFiles') {
      fsFile!.label = labels.current;
      Object.assign(otherFile!, { label: labels.other });
      const modified = {
        filePath,
        fsFile: fsFile!,
        baseFile: row.base === undefined ? undefined : prepared.baseModels[row.base],
        otherFile: otherFile!,
        isBinaryConflict: row.isBinaryConflict,
      } as MergeResultsThreeWay['modifiedFiles'][number];
      for (const [field, index] of [
        ['output', row.outputPlanIndex],
        ['conflict', row.conflictPlanIndex],
      ] as const) {
        const source = index === undefined ? undefined : capturedBody(index);
        lazyValue(modified, field, () => (source ? source.contents.toString() : null));
      }
      results.modifiedFiles.push(modified);
    } else if (row.kind === 'unModifiedFiles') results.unModifiedFiles.push({ filePath, fsFile: fsFile! });
    else results[row.kind].push({ filePath });
  }
  mergePlans.set(results, prepared);
  mergeCurrentBodies.set(
    results,
    clones.map((file) => ({ file, body: file.contents, copy: Buffer.from(file.contents) }))
  );
  mergeBodies.set(results, [
    ...bodies.values(),
    ...results.addFiles.filter((row) => !clones.includes(row.fsFile)).map((row) => row.fsFile),
    ...results.deletedConflictFiles.flatMap((row) => (row.fsFile && !clones.includes(row.fsFile) ? [row.fsFile] : [])),
  ]);
  const observed: object[] = [results];
  for (const key of Object.keys(results)) {
    const value = Object.getOwnPropertyDescriptor(results, key)?.value;
    if (Array.isArray(value)) observed.push(value, ...value);
  }
  mergeSnapshots.set(
    results,
    observed.map((object) => ({ object, fields: Object.getOwnPropertyDescriptors(object) }))
  );
  return results;
}
