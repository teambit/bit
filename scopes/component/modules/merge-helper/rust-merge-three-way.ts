import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { types } from 'util';
import { orderedRustMergeRows, rustMergeRowKey } from './rust-merge-row-order';
import { createHash } from 'crypto';
import {
  readRustBodyRangeSync,
  getRustMergeTransactionToken,
  requestRustMergeTransaction,
  canRequestRustMergeTransaction,
  hasRustSnapshotTransactionClassFields,
  hasRustSnapshotTransactionClassFieldsBatch,
  hasRustSnapshotTransactionClassConstructor,
  canUseRustHistoryQueryRepository,
  canHydrateRustHistoryQuerySources,
  captureRustHistoryQueryObjects,
  validRustHistorySourceReceipt,
  registerRustSnapshotFunctions,
  hasRustSnapshotFunctions,
  hasRustSnapshotFunctionReference,
} from '@teambit/objects';
import type { Version, SourceFileModel, HistorySourceCapsule } from '@teambit/objects';
import type { Scope } from '@teambit/legacy.scope';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import type { SourceFile } from '@teambit/component.sources';
import {
  getRustWorkspaceMergeDescriptor,
  getRustHistorySourceDescriptor,
  registerRustWorkspaceEngineCleanup,
  canReadWorkspaceFilesNatively,
} from '@teambit/component.sources';
import { continueThreeWayMerge } from './three-way-merge';
import type { MergeResultsThreeWay, MergeCurrentObservation } from './three-way-merge';
import {
  copyRustMergeBuffer,
  hasRustMergeBufferProperties,
  hasRustMergeBufferPrototypes,
  captureNativeMergeTarget,
  getRustMergeBodyPlanIndex,
  rememberRustMergeResultBodyPlan,
} from './rust-merge-body-plan';
import type { RustMergeBody, RustMergeBodyPlan, RustMergeRow } from './rust-merge-body-plan';
import { observeRustMergeSourceGroups, validRustMergeSourceGroups } from './rust-merge-source-groups';
import type { MergeSourceGroup, MergeSourceObservation } from './rust-merge-source-groups';

type Params = {
  scope: Scope;
  otherComponent: Version;
  baseComponent: Version;
  currentComponent: ConsumerComponent;
  currentLabel: string;
  otherLabel: string;
};
type Current = {
  relativePath: string;
  protected: boolean;
  workspace?: { path: string; rawHash: string; snapshotHash: string; bitmap?: boolean; readToken?: number };
  source?: { hash: string; path?: string };
};
type Prepared = {
  token: string;
  ownerToken: string;
  index: number;
  count: number;
  hasConflicts: boolean;
  bodies: RustMergeBody[];
  mergeRows: RustMergeRow[];
  currentFiles: RustMergeBodyPlan['currentRows'];
  sources: HistorySourceCapsule[];
  sourceGroups: MergeSourceGroup[];
};
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const bodyHash = createHash;
const remove = fs.remove;
const readFile = fs.readFileSync;
const readRange = readRustBodyRangeSync;
const equals = Buffer.prototype.equals;
const exportsCaptured: Array<{ module: object; key: string; descriptor: PropertyDescriptor }> = [];
const definingSources = {
  workspace: require('@teambit/component.sources/dist/rust-workspace-identity.js'),
  repository: require('@teambit/component.sources/dist/rust-checkout-source.js'),
  files: require('@teambit/component.sources/dist/source-file.js'),
};

function captureExport(module: object, key: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(module, key);
  if (descriptor) exportsCaptured.push({ module, key, descriptor });
}
for (const key of [
  'getRustWorkspaceMergeDescriptor',
  'getRustHistorySourceDescriptor',
  'registerRustWorkspaceEngineCleanup',
  'canReadWorkspaceFilesNatively',
]) {
  captureExport(require('@teambit/component.sources'), key);
}
captureExport(definingSources.workspace, 'getRustWorkspaceMergeDescriptor');
captureExport(definingSources.repository, 'getRustHistorySourceDescriptor');
captureExport(definingSources.files, 'canReadWorkspaceFilesNatively');
captureExport(definingSources.files, 'default');
const definingEol = require('@teambit/toolbox.string.eol/dist/eol.js');
captureExport(definingEol, 'captureDefaultEolLf');
captureExport(definingEol, 'lf');
const lfGuard = Object.getOwnPropertyDescriptor(definingEol, 'captureDefaultEolLf')?.value;
const lf = Object.getOwnPropertyDescriptor(definingEol, 'lf')?.value;
const git = require('@teambit/git.modules.git-executable/dist/git-executable.js');
captureExport(git, 'canUseDefaultGitNatively');
const gitGuard = Object.getOwnPropertyDescriptor(git, 'canUseDefaultGitNatively')?.value;
captureExport(require('@teambit/toolbox.crypto.sha1'), 'sha1');
const definingSha = require('@teambit/toolbox.crypto.sha1/dist/sha1.js');
captureExport(definingSha, 'sha1');
const prefixSha = Object.getOwnPropertyDescriptor(definingSha, 'sha1')?.value;
registerRustSnapshotFunctions('MergeThreeWayFS', fs, ['mkdtemp', 'readFileSync', 'remove']);
registerRustSnapshotFunctions('MergeThreeWayOS', os, ['tmpdir']);
registerRustSnapshotFunctions('MergeThreeWayPath', path, ['join', 'dirname', 'resolve']);
registerRustSnapshotFunctions('MergeThreeWayBuffer', Buffer, ['from', 'isBuffer']);
registerRustSnapshotFunctions('MergeThreeWayBufferMethods', Buffer.prototype, ['equals', 'toString']);

function defaultFunctions(): boolean {
  if (
    !hasRustSnapshotFunctions([
      'MergeThreeWayFS',
      'MergeThreeWayOS',
      'MergeThreeWayPath',
      'MergeThreeWayBuffer',
      'MergeThreeWayBufferMethods',
      'MergeSourceFilePaths',
    ])
  )
    return false;
  if (
    exportsCaptured.length !== 13 ||
    !exportsCaptured.every(({ module, key, descriptor }) => {
      const live = Object.getOwnPropertyDescriptor(module, key);
      return Boolean(
        live &&
          live.value === descriptor.value &&
          live.get === descriptor.get &&
          live.set === descriptor.set &&
          live.writable === descriptor.writable &&
          live.enumerable === descriptor.enumerable &&
          live.configurable === descriptor.configurable
      );
    })
  )
    return false;
  const tmp = Object.getOwnPropertyDescriptor(
    require('@teambit/legacy.scope/dist/repositories/tmp.js'),
    'default'
  )?.value;
  const merge = Object.getOwnPropertyDescriptor(require('./merge-files'), 'mergeFiles')?.value;
  const shaDescriptor = Object.getOwnPropertyDescriptor(definingSha, 'sha1');
  const sha = shaDescriptor && 'value' in shaDescriptor ? shaDescriptor.value : undefined;
  const workspace = Object.getOwnPropertyDescriptor(
    definingSources.workspace,
    'getRustWorkspaceMergeDescriptor'
  )?.value;
  const repository = Object.getOwnPropertyDescriptor(
    definingSources.repository,
    'getRustHistorySourceDescriptor'
  )?.value;
  const files = Object.getOwnPropertyDescriptor(definingSources.files, 'canReadWorkspaceFilesNatively')?.value;
  const sourceConstructor = Object.getOwnPropertyDescriptor(definingSources.files, 'default')?.value;
  return (
    hasRustSnapshotTransactionClassConstructor('MergeTmp', tmp) &&
    hasRustSnapshotFunctionReference('MergeCanonicalFiles', merge) &&
    hasRustSnapshotTransactionClassConstructor('SourceFile', sourceConstructor) &&
    hasRustSnapshotFunctionReference('MergeWorkspaceSourceDescriptor', workspace) &&
    hasRustSnapshotFunctionReference('HistoryQuerySourceDescriptor', repository) &&
    hasRustSnapshotFunctionReference('MergeWorkspaceFileReadEligibility', files) &&
    hasRustSnapshotFunctionReference('MergeCanonicalSha1', sha) &&
    hasRustSnapshotFunctionReference('CheckoutPlanDefiningLfGuard', lfGuard) &&
    typeof lfGuard === 'function' &&
    typeof lfGuard() === 'function' &&
    hasRustSnapshotFunctionReference('HistoryQueryGitEligibility', gitGuard) &&
    typeof gitGuard === 'function' &&
    gitGuard() &&
    canReadWorkspaceFilesNatively() &&
    Object.getOwnPropertyDescriptor(require('crypto'), 'createHash')?.value === bodyHash
  );
}

function writableLabels(files: SourceFileModel[]): boolean {
  return files.every((file) => {
    const label = Object.getOwnPropertyDescriptor(file, 'label');
    return label ? 'value' in label && label.writable : Object.isExtensible(file);
  });
}

/** Preserve only canonical synchronous public label assignments; Native owns the resulting merge plan. */
function applyLabelPrefix(
  current: SourceFile[],
  base: SourceFileModel[],
  other: SourceFileModel[],
  currentLabel: string,
  otherLabel: string
): MergeCurrentObservation[] {
  const observations: MergeCurrentObservation[] = [];
  const firstRows = (files: SourceFileModel[]) => {
    const rows = new Map<string, SourceFileModel>();
    for (const file of files) if (!rows.has(file.relativePath)) rows.set(file.relativePath, file);
    return rows;
  };
  const otherRows = firstRows(other),
    baseRows = firstRows(base);
  for (const file of current) {
    const relativePath = file.relative.replace(/\\/g, '/');
    const otherFile = otherRows.get(relativePath);
    const baseFile = baseRows.get(relativePath);
    const currentHash = prefixSha(file.contents);
    observations.push({
      filePath: relativePath,
      hash: currentHash,
      baseFile,
      otherFile,
      baseHash: baseFile?.file.hash,
      otherHash: otherFile?.file.hash,
    });
    if (!otherFile) continue;
    if (currentHash === otherFile.file.hash || (baseFile && currentHash === baseFile.file.hash)) continue;
    file.label = currentLabel;
    Object.assign(otherFile, { label: otherLabel });
  }
  return observations;
}

function denseFiles(files: unknown): files is SourceFile[] {
  if (
    !files ||
    typeof files !== 'object' ||
    types.isProxy(files) ||
    !hasRustSnapshotTransactionClassFields(files, 'Array', [])
  )
    return false;
  const fields = Object.getOwnPropertyDescriptors(files);
  const length = fields.length?.value;
  return (
    Number.isInteger(length) &&
    length <= 4096 &&
    Reflect.ownKeys(fields).length === length + 1 &&
    Array.from({ length }, (_, index) => fields[index]).every((field) => field && 'value' in field)
  );
}

function currentMetadata(files: SourceFile[], scope: Scope): Current[] | undefined {
  if (!hasRustSnapshotTransactionClassFieldsBatch(files, 'SourceFile', ['history', '_base', '_cwd'])) return undefined;
  const rows: Current[] = [];
  for (const file of files) {
    const workspace = getRustWorkspaceMergeDescriptor(file, true);
    const source = workspace ? undefined : getRustHistorySourceDescriptor(file, scope.objects);
    if (!workspace && !source) return undefined;
    const relativePath = file.relative.replace(/\\/g, '/');
    rows.push({
      relativePath,
      protected: false,
      ...(workspace
        ? {
            workspace: {
              path: workspace.path,
              rawHash: workspace.hash,
              snapshotHash: workspace.snapshotHash!,
              ...(workspace.bitmap ? { bitmap: true } : {}),
              ...(workspace.readToken === undefined ? {} : { readToken: workspace.readToken }),
            },
          }
        : { source: { hash: source!.hash, ...(path.isAbsolute(file.path) ? { path: file.path } : {}) } }),
    });
    if (workspace && !hash(workspace.snapshotHash)) return undefined;
  }
  return new Set(rows.map((row) => row.relativePath)).size === rows.length ? rows : undefined;
}

function cachedSourcesMatch(scope: Scope, models: SourceFileModel[]): boolean {
  const hashes = [...new Set(models.map((model) => Object.getOwnPropertyDescriptor(model.file, 'hash')?.value))];
  const entries = captureRustHistoryQueryObjects(scope.objects, hashes);
  if (
    !entries ||
    !hasRustSnapshotTransactionClassFieldsBatch(
      entries.map(([, source]) => source),
      'Source',
      ['contents']
    )
  )
    return false;
  for (const [expected, cached] of entries) {
    const body = Object.getOwnPropertyDescriptor(cached, 'contents')?.value;
    if (
      !body ||
      types.isProxy(body) ||
      !Buffer.isBuffer(body) ||
      Object.getPrototypeOf(body) !== Buffer.prototype ||
      bodyHash('sha1').update(body).digest('hex') !== expected
    )
      return false;
  }
  return true;
}

function validPrepared(
  value: any,
  directory: string,
  owner: string,
  index: number,
  currentCount: number,
  baseFiles: SourceFileModel[],
  otherFiles: SourceFileModel[]
): boolean {
  if (
    !value ||
    !hash(value.token) ||
    value.ownerToken !== owner ||
    value.index !== index ||
    typeof value.hasConflicts !== 'boolean' ||
    !Array.isArray(value.bodies) ||
    value.bodies.length > 4096 ||
    value.count !== value.bodies.length ||
    !Array.isArray(value.mergeRows) ||
    value.mergeRows.length > 16384 ||
    !Array.isArray(value.currentFiles) ||
    value.currentFiles.length !== currentCount ||
    !validRustHistorySourceReceipt({ sources: value.sources, sourceLoads: [] }, directory)
  )
    return false;
  for (let bodyIndex = 0; bodyIndex < value.bodies.length; bodyIndex++) {
    const body = value.bodies[bodyIndex];
    if (
      !body ||
      body.planIndex !== bodyIndex ||
      !hash(body.spoolHash) ||
      typeof body.spoolPath !== 'string' ||
      path.dirname(body.spoolPath) !== directory ||
      !Number.isSafeInteger(body.bytes) ||
      body.bytes < 0 ||
      body.bytes > 32 * 1024 * 1024 ||
      (body.spoolOffset !== undefined &&
        (!Number.isSafeInteger(body.spoolOffset) ||
          body.spoolOffset < 0 ||
          body.spoolOffset + body.bytes > 32 * 1024 * 1024))
    )
      return false;
  }
  const kinds = [
    'unModifiedFiles',
    'addFiles',
    'removeFiles',
    'deletedConflictFiles',
    'updatedFiles',
    'modifiedFiles',
    'remainDeletedFiles',
  ];
  const rowKeys = [
    'kind',
    'current',
    'base',
    'other',
    'currentHash',
    'bodyPlanIndex',
    'outputPlanIndex',
    'conflictPlanIndex',
    'isBinaryConflict',
  ];
  for (const row of value.mergeRows) {
    if (!row || !kinds.includes(row.kind) || Object.keys(row).some((key) => !rowKeys.includes(key))) return false;
    for (const [key, length] of [
      ['current', currentCount],
      ['base', baseFiles.length],
      ['other', otherFiles.length],
    ] as Array<[string, number]>) {
      if (row[key] !== undefined && (!Number.isInteger(row[key]) || row[key] < 0 || row[key] >= length)) return false;
    }
    for (const key of ['bodyPlanIndex', 'outputPlanIndex', 'conflictPlanIndex']) {
      if (row[key] !== undefined && (!Number.isInteger(row[key]) || !value.bodies[row[key]])) return false;
    }
    if (
      ['unModifiedFiles', 'removeFiles', 'updatedFiles', 'modifiedFiles'].includes(row.kind) &&
      row.current === undefined
    )
      return false;
    if (['updatedFiles', 'modifiedFiles', 'remainDeletedFiles'].includes(row.kind) && row.other === undefined)
      return false;
    if (['addFiles', 'deletedConflictFiles'].includes(row.kind) && row.current === undefined && row.other === undefined)
      return false;
  }
  return validRustMergeSourceGroups(value.sourceGroups, value.sources, value.mergeRows, baseFiles, otherFiles);
}

function lazyText(row: object, key: 'output' | 'conflict', body?: RustMergeBody): void {
  if (!body) {
    Object.defineProperty(row, key, { value: null, writable: true, enumerable: true, configurable: true });
    return;
  }
  let value: string | undefined;
  const spoolPath = body.spoolPath;
  const get = () => {
    if (value === undefined) {
      const bytes =
        body.spoolOffset === undefined ? readFile(spoolPath) : readRange(spoolPath, body.spoolOffset, body.bytes);
      if (bytes.length !== body.bytes || bodyHash('sha1').update(bytes).digest('hex') !== body.spoolHash)
        throw new Error('merge compatibility snapshot changed');
      value = bytes.toString();
    }
    return value;
  };
  const set = (next: string | null | undefined) => {
    Object.defineProperty(row, key, { value: next, writable: true, enumerable: true, configurable: true });
  };
  Object.defineProperty(row, key, { enumerable: true, configurable: true, get, set });
  registerRustWorkspaceEngineCleanup(() => {
    const live = Object.getOwnPropertyDescriptor(row, key);
    if (live?.get !== get || live.set !== set) return;
    // Escaped public results outlive the owned spool directory; do not call any replaced public getter.
    const contents = get();
    Object.defineProperty(row, key, { value: contents, writable: true, enumerable: true, configurable: true });
  });
}

function assemble(
  prepared: Prepared,
  rows: RustMergeRow[],
  observation: MergeSourceObservation,
  current: SourceFile[],
  baseFiles: SourceFileModel[],
  otherFiles: SourceFileModel[]
): { results: MergeResultsThreeWay; aliases: Map<string, Buffer>; otherAliases: Map<number, Buffer> } {
  const results: MergeResultsThreeWay = {
    addFiles: [],
    removeFiles: [],
    remainDeletedFiles: [],
    deletedConflictFiles: [],
    modifiedFiles: [],
    unModifiedFiles: [],
    overrideFiles: [],
    updatedFiles: [],
    hasConflicts: prepared.hasConflicts,
  };
  const aliases = new Map<string, Buffer>();
  const otherAliases = new Map<number, Buffer>();
  for (const currentRow of prepared.currentFiles) {
    aliases.set(`${currentRow.planIndex}:${currentRow.relativePath}`, current[currentRow.index].contents);
  }
  const firstRows = new Map<string, number>();
  prepared.mergeRows.forEach((row, index) => {
    const key = rustMergeRowKey(row);
    if (!firstRows.has(key)) firstRows.set(key, index);
  });
  for (const row of rows) {
    // Row identity remains the immutable prepare ordinal even after category ordering.
    const original = firstRows.get(rustMergeRowKey(row))!;
    const observed = observation.sources.get(original);
    if (row.other !== undefined && observed) otherAliases.set(row.other, observed.otherContents);
    const fsFile = row.current === undefined ? observed?.file : current[row.current];
    const otherFile = row.other === undefined ? undefined : otherFiles[row.other];
    const baseFile = row.base === undefined ? undefined : baseFiles[row.base];
    const filePath = fsFile ? fsFile.relative.replace(/\\/g, '/') : otherFile!.relativePath;
    if (row.bodyPlanIndex !== undefined && observed)
      aliases.set(`${row.bodyPlanIndex}:${filePath}`, observed.otherContents);
    if (row.kind === 'modifiedFiles') {
      const modified = {
        filePath,
        fsFile: fsFile!,
        baseFile,
        otherFile: otherFile!,
        output: null,
        conflict: null,
        isBinaryConflict: row.isBinaryConflict,
      };
      lazyText(
        modified,
        'output',
        row.outputPlanIndex === undefined ? undefined : prepared.bodies[row.outputPlanIndex]
      );
      lazyText(
        modified,
        'conflict',
        row.conflictPlanIndex === undefined ? undefined : prepared.bodies[row.conflictPlanIndex]
      );
      results.modifiedFiles.push(modified);
    } else if (row.kind === 'updatedFiles') {
      results.updatedFiles.push({ filePath, otherFile: otherFile!, content: observed!.otherContents });
    } else if (row.kind === 'addFiles' || row.kind === 'unModifiedFiles') {
      results[row.kind].push({ filePath, fsFile: fsFile! });
    } else if (row.kind === 'deletedConflictFiles') {
      results.deletedConflictFiles.push(observed?.file ? { filePath, fsFile: observed.file } : { filePath });
    } else if (row.kind === 'removeFiles') results.removeFiles.push({ filePath });
    else if (row.kind === 'remainDeletedFiles') results.remainDeletedFiles.push({ filePath });
  }
  return { results, aliases, otherAliases };
}

/** Owned operation only; unsupported callers retain the older canonical/BMH path. */
export async function tryRustOwnedThreeWayMerge(params: Params): Promise<MergeResultsThreeWay | undefined> {
  const token = getRustMergeTransactionToken();
  const index = getRustMergeBodyPlanIndex();
  if (
    !canRequestRustMergeTransaction() ||
    !token ||
    index === undefined ||
    !defaultFunctions() ||
    types.isProxy(params.scope) ||
    !hasRustSnapshotTransactionClassFields(params.scope, 'MergeLegacyScope', ['objects']) ||
    !canUseRustHistoryQueryRepository(params.scope.objects) ||
    !canHydrateRustHistoryQuerySources() ||
    !hasRustSnapshotTransactionClassFields(params.currentComponent, 'ConsumerComponent', ['files'])
  )
    return undefined;
  const repositoryField = Object.getOwnPropertyDescriptor(params.scope, 'objects')!;
  const repository = repositoryField.value;
  let target = captureNativeMergeTarget(params.otherComponent),
    base = captureNativeMergeTarget(params.baseComponent);
  const originalFiles = Object.getOwnPropertyDescriptor(params.currentComponent, 'files')?.value;
  if (
    !target ||
    !base ||
    !denseFiles(originalFiles) ||
    !writableLabels(params.otherComponent.files) ||
    !cachedSourcesMatch(params.scope, [...params.baseComponent.files, ...params.otherComponent.files])
  )
    return undefined;
  const metadata = currentMetadata(originalFiles, params.scope);
  if (!metadata) return undefined;
  const baseFiles = params.baseComponent.files,
    otherFiles = params.otherComponent.files;
  const currentFiles = params.currentComponent.cloneFilesWithSharedDir();
  currentFiles.forEach((file) => {
    file.contents = lf(file.contents);
  });
  const observedCurrent = applyLabelPrefix(currentFiles, baseFiles, otherFiles, params.currentLabel, params.otherLabel);
  target = captureNativeMergeTarget(params.otherComponent);
  base = captureNativeMergeTarget(params.baseComponent);
  const currentBodies = currentFiles.map((file) => {
    const body = file.contents;
    return {
      body,
      copy: hasRustMergeBufferProperties(body) ? copyRustMergeBuffer(body) : undefined,
    };
  });
  const continuation = (observed?: MergeSourceObservation) =>
    continueThreeWayMerge({
      scope: params.scope,
      currentLabel: params.currentLabel,
      otherLabel: params.otherLabel,
      baseFiles,
      otherFiles,
      currentFiles,
      observedSources: observed?.continuation,
      observedCurrent,
    });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-merge-transaction-')).catch(() => undefined);
  if (!directory || !target || !base) return continuation();
  registerRustWorkspaceEngineCleanup(() => remove(directory));
  const capturedTarget = target,
    capturedBase = base;
  const fresh = () => {
    if (
      !defaultFunctions() ||
      types.isProxy(params.scope) ||
      !hasRustSnapshotTransactionClassFields(params.scope, 'MergeLegacyScope', ['objects'])
    )
      return false;
    const live = Object.getOwnPropertyDescriptor(params.scope, 'objects');
    return Boolean(
      live &&
        'value' in live &&
        live.value === repository &&
        live.writable === repositoryField.writable &&
        live.enumerable === repositoryField.enumerable &&
        live.configurable === repositoryField.configurable &&
        capturedTarget.fresh() &&
        capturedBase.fresh() &&
        hasRustMergeBufferPrototypes() &&
        currentBodies.every(
          ({ body, copy }, at) =>
            copy && hasRustMergeBufferProperties(body) && currentFiles[at].contents === body && equals.call(body, copy)
        )
    );
  };
  if (!fresh()) return continuation();
  const prepared = await requestRustMergeTransaction<Prepared>(
    {
      kind: 'mergePrepare',
      packedBodies: true,
      token,
      index,
      objectsDirectory: params.scope.objects.getPath(),
      snapshotDirectory: directory,
      target: target.manifest,
      base: base.manifest,
      current: metadata,
      labels: { current: params.currentLabel, other: params.otherLabel },
    },
    (value) => validPrepared(value, directory, token, index, currentFiles.length, baseFiles, otherFiles)
  );
  if (!prepared || !fresh()) return continuation();
  const observed = await observeRustMergeSourceGroups(
    params.scope.objects,
    prepared.sources,
    prepared.sourceGroups,
    baseFiles,
    otherFiles
  );
  if (!fresh() || !observed.fresh()) return continuation(observed);
  const ordered = await requestRustMergeTransaction<{ rowIndices: number[] }>(
    { kind: 'mergePlanOrder', indexedRows: true, token, planToken: prepared.token, groups: observed.groups },
    (value) => Boolean(orderedRustMergeRows(value, prepared.mergeRows))
  );
  if (!ordered || !fresh() || !observed.fresh()) return continuation(observed);
  const orderedRows = orderedRustMergeRows(ordered, prepared.mergeRows)!;
  const assembled = assemble(prepared, orderedRows, observed, currentFiles, baseFiles, otherFiles);
  // Canonical label writes occurred above; capture their intended metadata effects for future prompt freshness checks.
  const labelledTarget = captureNativeMergeTarget(params.otherComponent),
    labelledBase = captureNativeMergeTarget(params.baseComponent);
  rememberRustMergeResultBodyPlan(assembled.results, {
    ownerToken: token,
    token: prepared.token,
    index,
    snapshotDirectory: directory,
    bodies: prepared.bodies,
    rows: orderedRows,
    currentFiles: originalFiles,
    currentClones: currentFiles,
    currentRows: prepared.currentFiles,
    targetManifest: target.manifest,
    bodyAliases: assembled.aliases,
    otherAliases: assembled.otherAliases,
    valid: () => defaultFunctions() && observed.fresh() && Boolean(labelledTarget?.fresh() && labelledBase?.fresh()),
  });
  return assembled.results;
}
