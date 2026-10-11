import path from 'path';
import { createHash } from 'crypto';
import { Ref, Repository, Source, canHashSourceNatively, type SourceFileModel, type Version } from '@teambit/objects';
import { ConsumerComponent } from '@teambit/legacy.consumer-component';
import { Tmp, type Scope } from '@teambit/legacy.scope';
import {
  SourceFile,
  AbstractVinyl,
  canReadWorkspaceFilesNatively,
  getRustWorkspaceMergeDescriptor,
  getRustCheckoutSourceDescriptor,
  withWorkspaceSession,
} from '@teambit/component.sources';
import * as eol from '@teambit/toolbox.string.eol';
import { sha1 } from '@teambit/toolbox.crypto.sha1';
import { pathNormalizeToLinux } from '@teambit/toolbox.path.path';
import { getGitExecutablePath } from '@teambit/git.modules.git-executable';
import { mergeFiles } from './merge-files';
import type { MergeResultsThreeWay } from './three-way-merge';

const MAX_INPUT = 4 * 1024 * 1024;
const MAX_OUTPUT = 32 * 1024 * 1024;
const MAX_FILES = 4096;
const defaults = {
  clone: SourceFile.prototype.clone,
  cloneFiles: ConsumerComponent.prototype.cloneFilesWithSharedDir,
  updatePaths: AbstractVinyl.prototype.updatePaths,
  lf: eol.lf,
  sha1,
  normalize: pathNormalizeToLinux,
  mergeFiles,
  gitPath: getGitExecutablePath,
  tmpSave: Tmp.prototype.save,
  tmpPath: Tmp.prototype.getPath,
  sourceParse: Source.parse,
};
const refDefaults = { toString: Ref.prototype.toString, load: Ref.prototype.load };
const repositoryDefaults = [
  'load',
  'loadSync',
  'getCache',
  'getPath',
  'objectPath',
  'hashPath',
  'isContentTransformed',
  'canReadCheckoutSourcesNatively',
].map((name) => [name, Repository.prototype[name]] as const);
const hashString = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const filePath = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  !path.isAbsolute(value) &&
  !value.includes('\\') &&
  !value.includes('\0') &&
  Buffer.from(value).toString() === value &&
  Buffer.byteLength(value) <= 32768 &&
  value.split('/').every((part) => part && !['.', '..', '__proto__', 'constructor', 'prototype'].includes(part));
const ownData = (object: object, name: string) => !Object.getOwnPropertyDescriptor(object, name)?.get;
function ordinaryRef(reference: Ref): boolean {
  return Boolean(
    reference &&
      Object.getPrototypeOf(reference) === Ref.prototype &&
      hashString(Object.getOwnPropertyDescriptor(reference, 'hash')?.value) &&
      Object.entries(refDefaults).every(
        ([name, method]) =>
          (Object.getOwnPropertyDescriptor(reference, name) || Object.getOwnPropertyDescriptor(Ref.prototype, name))
            ?.value === method
      )
  );
}
function ordinaryMethods(component: ConsumerComponent, repository: Repository): boolean {
  return (
    component.cloneFilesWithSharedDir === defaults.cloneFiles &&
    SourceFile.prototype.clone === defaults.clone &&
    AbstractVinyl.prototype.updatePaths === defaults.updatePaths &&
    eol.lf === defaults.lf &&
    sha1 === defaults.sha1 &&
    pathNormalizeToLinux === defaults.normalize &&
    mergeFiles === defaults.mergeFiles &&
    getGitExecutablePath === defaults.gitPath &&
    Tmp.prototype.save === defaults.tmpSave &&
    Tmp.prototype.getPath === defaults.tmpPath &&
    Source.parse === defaults.sourceParse &&
    canReadSourceMethods() &&
    canReadWorkspaceFilesNatively() &&
    repositoryDefaults.every(([name, method]) => repository[name] === method)
  );
}
function canReadSourceMethods() {
  return canHashSourceNatively();
}

type Model = { path: string; hash: string };
type Current = {
  path: string;
  workspace?: { path: string; hash: string; linuxHash: string };
  source?: { hash: string };
};
type Row = {
  kind: keyof MergeResultsThreeWay;
  current?: number;
  base?: number;
  other?: number;
  currentHash?: string;
  body?: string;
  output?: string | null;
  conflict?: string | null;
  isBinaryConflict?: boolean;
};
type Plan = { files: Row[]; hasConflicts: boolean };
type Params = {
  scope: Scope;
  otherComponent: Version;
  otherLabel: string;
  currentComponent: ConsumerComponent;
  currentLabel: string;
  baseComponent: Version;
};

function models(files: SourceFileModel[]): Model[] | undefined {
  if (!Array.isArray(files) || files.length > MAX_FILES) return undefined;
  const result: Model[] = [];
  for (const file of files) {
    if (
      !file ||
      !['relativePath', 'file', 'name', 'test'].every((name) => ownData(file, name)) ||
      !filePath(file.relativePath) ||
      !ordinaryRef(file.file)
    )
      return undefined;
    result.push({ path: file.relativePath, hash: file.file.hash });
  }
  return new Set(result.map((file) => file.path)).size === result.length ? result : undefined;
}

/** Native reads/classification/Git remain a pure plan until the caller chooses its merge strategy. */
export async function tryRustThreeWayMerge(params: Params): Promise<MergeResultsThreeWay | undefined> {
  const { scope, currentComponent, otherComponent, baseComponent, currentLabel, otherLabel } = params;
  if (
    process.env.BIT_RUST_CLIENT_VCS !== 'on' ||
    !scope?.objects ||
    ![currentComponent, otherComponent, baseComponent].every((component) => ownData(component, 'files')) ||
    !ordinaryMethods(currentComponent, scope.objects) ||
    typeof currentLabel !== 'string' ||
    typeof otherLabel !== 'string' ||
    [currentLabel, otherLabel].some((label) => label.includes('\0') || Buffer.from(label).toString() !== label)
  )
    return undefined;
  if (![currentComponent.files, baseComponent.files, otherComponent.files].every(Array.isArray)) return undefined;
  const currentFiles = currentComponent.files.slice();
  const baseFiles = baseComponent.files.slice();
  const otherFiles = otherComponent.files.slice();
  const base = models(baseFiles);
  const other = models(otherFiles);
  if (!base || !other || currentFiles.length > MAX_FILES) return undefined;
  const repository = scope.objects;
  const directory = path.resolve(repository.getPath());
  const current: Current[] = [];
  for (const file of currentFiles) {
    if (
      Object.getPrototypeOf(file) !== SourceFile.prototype ||
      file.clone !== defaults.clone ||
      file.updatePaths !== defaults.updatePaths ||
      ['relative', 'path', 'base', 'test'].some((name) => !ownData(file, name))
    )
      return undefined;
    const relative = pathNormalizeToLinux(file.relative);
    if (!filePath(relative)) return undefined;
    const workspace = getRustWorkspaceMergeDescriptor(file);
    const stored = workspace ? undefined : getRustCheckoutSourceDescriptor(file);
    if (!workspace && (!stored || stored.objectsDirectory !== directory)) return undefined;
    current.push(workspace ? { path: relative, workspace } : { path: relative, source: { hash: stored!.hash } });
  }
  if (new Set(current.map((file) => file.path)).size !== current.length) return undefined;
  const refs = [...baseFiles, ...otherFiles].map((file) => file.file);
  const currentRefs = current.filter((file) => file.source).map((file) => new Ref(file.source!.hash));
  if (!repository.canReadCheckoutSourcesNatively([...refs, ...currentRefs])) return undefined;
  const metadata = JSON.stringify({
    base: baseFiles.map((file) => [file.name, file.test]),
    other: otherFiles.map((file) => [file.name, file.test]),
    current: currentFiles.map((file) => [file.test, file.base, file.path]),
  });
  const projection = () => ({
    kind: 'mergeFiles',
    objectsDirectory: directory,
    labels: { current: currentLabel, other: otherLabel },
    base,
    other,
    current,
  });
  const input = projection();
  const bytes = Buffer.from(JSON.stringify(input));
  if (bytes.length > MAX_INPUT) return undefined;
  let plan: Plan | undefined;
  await withWorkspaceSession(async (session) => {
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
        if (response.failed) return true;
        if (response.completed !== 1 || !validPlan(response.data, base, other, current)) return false;
        plan = response.data;
        return true;
      },
      MAX_OUTPUT
    );
  });
  if (
    !plan ||
    !ordinaryMethods(currentComponent, repository) ||
    path.resolve(repository.getPath()) !== directory ||
    ![currentComponent, otherComponent, baseComponent].every((component) => ownData(component, 'files')) ||
    ![...refs, ...currentRefs].every(ordinaryRef) ||
    currentFiles.some((file) => ['test', 'base', 'path', 'relative'].some((name) => !ownData(file, name))) ||
    !repository.canReadCheckoutSourcesNatively([...refs, ...currentRefs]) ||
    currentComponent.files.length !== currentFiles.length ||
    currentComponent.files.some((file, index) => file !== currentFiles[index]) ||
    baseComponent.files.length !== baseFiles.length ||
    baseComponent.files.some((file, index) => file !== baseFiles[index]) ||
    otherComponent.files.length !== otherFiles.length ||
    otherComponent.files.some((file, index) => file !== otherFiles[index]) ||
    JSON.stringify(models(baseFiles)) !== JSON.stringify(base) ||
    JSON.stringify(models(otherFiles)) !== JSON.stringify(other) ||
    JSON.stringify({
      base: baseFiles.map((file) => [file.name, file.test]),
      other: otherFiles.map((file) => [file.name, file.test]),
      current: currentFiles.map((file) => [file.test, file.base, file.path]),
    }) !== metadata ||
    currentFiles.some((file, index) => {
      const descriptor = current[index].workspace
        ? getRustWorkspaceMergeDescriptor(file)
        : getRustCheckoutSourceDescriptor(file);
      return (
        JSON.stringify(descriptor) !==
        JSON.stringify(current[index].workspace || { objectsDirectory: directory, hash: current[index].source!.hash })
      );
    })
  )
    return undefined;
  return publicResults(plan, params, baseFiles, otherFiles);
}

function publicResults(
  plan: Plan,
  params: Params,
  baseFiles: SourceFileModel[],
  otherFiles: SourceFileModel[]
): MergeResultsThreeWay {
  const { currentComponent, currentLabel, otherLabel } = params;
  const clones = currentComponent.cloneFilesWithSharedDir();
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
    hasConflicts: plan.hasConflicts,
  };
  for (const row of plan.files) {
    const fsFile = row.current === undefined ? undefined : clones[row.current];
    const otherFile = row.other === undefined ? undefined : otherFiles[row.other];
    const relative = fsFile ? pathNormalizeToLinux(fsFile.relative) : otherFile!.relativePath;
    if (row.kind === 'addFiles' || (row.kind === 'deletedConflictFiles' && row.body !== undefined)) {
      const loaded =
        fsFile ||
        new SourceFile({ base: '.', path: relative, contents: Buffer.from(row.body!, 'hex'), test: otherFile!.test });
      results[row.kind].push({ filePath: relative, fsFile: loaded });
    } else if (row.kind === 'updatedFiles')
      results.updatedFiles.push({ filePath: relative, otherFile: otherFile!, content: Buffer.from(row.body!, 'hex') });
    else if (row.kind === 'modifiedFiles') {
      fsFile!.label = currentLabel;
      Object.assign(otherFile!, { label: otherLabel });
      results.modifiedFiles.push({
        filePath: relative,
        fsFile: fsFile!,
        baseFile: row.base === undefined ? undefined : baseFiles[row.base],
        otherFile: otherFile!,
        output: row.output,
        conflict: row.conflict,
        isBinaryConflict: row.isBinaryConflict,
      });
    } else if (row.kind === 'unModifiedFiles') results.unModifiedFiles.push({ filePath: relative, fsFile: fsFile! });
    else if (row.kind === 'removeFiles' || row.kind === 'remainDeletedFiles' || row.kind === 'deletedConflictFiles')
      results[row.kind].push({ filePath: relative });
  }
  return results;
}

function validPlan(value: unknown, base: Model[], other: Model[], current: Current[]): value is Plan {
  const plan = value as Plan;
  if (
    !plan ||
    !Array.isArray(plan.files) ||
    plan.files.length > MAX_FILES * 3 ||
    typeof plan.hasConflicts !== 'boolean'
  )
    return false;
  const expected = expectedRows(plan, base, other, current);
  if (!expected) return false;
  if (plan.files.length !== expected.length) return false;
  let totalBytes = 0;
  let conflicts = false;
  for (let index = 0; index < expected.length; index++) {
    const row = plan.files[index];
    const want = expected[index];
    if (
      !row ||
      row.kind !== want.kind ||
      row.current !== want.current ||
      row.base !== want.base ||
      row.other !== want.other
    )
      return false;
    if (want.body) {
      if (typeof row.body !== 'string' || row.body.length % 2 || !/^[0-9a-f]*$/.test(row.body)) return false;
      const body = Buffer.from(row.body, 'hex');
      totalBytes += body.length;
      if (createHash('sha1').update(body).digest('hex') !== other[row.other!].hash) return false;
    } else if (row.body !== undefined) return false;
    if (row.kind === 'modifiedFiles') {
      if (
        !(
          (typeof row.output === 'string' && row.conflict === null && !row.isBinaryConflict) ||
          (row.output === null && typeof row.conflict === 'string' && Boolean(row.conflict) && !row.isBinaryConflict) ||
          (row.output === null && row.conflict === null && row.isBinaryConflict === true)
        )
      )
        return false;
      totalBytes += Buffer.byteLength(row.output || row.conflict || '');
      conflicts ||= Boolean(row.conflict || row.isBinaryConflict);
    } else if (row.output !== undefined || row.conflict !== undefined || row.isBinaryConflict !== undefined)
      return false;
    if (totalBytes > MAX_OUTPUT) return false;
  }
  return plan.hasConflicts === conflicts;
}

type ExpectedRow = { kind: Row['kind']; current?: number; base?: number; other?: number; body: boolean };
function expectedRows(plan: Plan, base: Model[], other: Model[], current: Current[]): ExpectedRow[] | undefined {
  const expected: ExpectedRow[] = [];
  for (let index = 0; index < current.length; index++) {
    const file = current[index];
    const baseIndex = base.findIndex((entry) => entry.path === file.path);
    const otherIndex = other.findIndex((entry) => entry.path === file.path);
    const row = plan.files[index];
    if (!row || !hashString(row.currentHash) || (file.workspace && row.currentHash !== file.workspace.linuxHash))
      return undefined;
    const kind =
      otherIndex < 0
        ? baseIndex < 0
          ? 'addFiles'
          : row.currentHash === base[baseIndex].hash
            ? 'removeFiles'
            : 'deletedConflictFiles'
        : row.currentHash === other[otherIndex].hash
          ? 'unModifiedFiles'
          : baseIndex >= 0 && row.currentHash === base[baseIndex].hash
            ? 'updatedFiles'
            : 'modifiedFiles';
    expected.push({
      kind,
      current: index,
      base: baseIndex < 0 ? undefined : baseIndex,
      other: otherIndex < 0 ? undefined : otherIndex,
      body: kind === 'updatedFiles',
    });
  }
  const missing = other
    .map((file, index) => ({ file, index, base: base.findIndex((entry) => entry.path === file.path) }))
    .filter(({ file }) => !current.some((entry) => entry.path === file.path));
  for (const { index: otherOffset, base: baseIndex } of missing.filter(
    ({ file: candidate, base: baseOffset }) => baseOffset >= 0 && base[baseOffset].hash === candidate.hash
  ))
    expected.push({ kind: 'remainDeletedFiles', other: otherOffset, base: baseIndex, body: false });
  for (const { index: otherOffset, base: baseIndex } of missing.filter(
    ({ file: candidate, base: baseOffset }) => baseOffset >= 0 && base[baseOffset].hash !== candidate.hash
  ))
    expected.push({ kind: 'deletedConflictFiles', other: otherOffset, base: baseIndex, body: false });
  for (const { index: otherOffset } of missing.filter(({ base: baseOffset }) => baseOffset < 0))
    expected.push({ kind: 'addFiles', other: otherOffset, body: true });
  for (const { index: otherOffset, base: baseIndex } of missing.filter(
    ({ file: candidate, base: baseOffset }) => baseOffset >= 0 && base[baseOffset].hash !== candidate.hash
  ))
    expected.push({ kind: 'deletedConflictFiles', other: otherOffset, base: baseIndex, body: true });
  return expected;
}
