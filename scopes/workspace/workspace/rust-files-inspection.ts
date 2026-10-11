import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import type { ComponentID } from '@teambit/component-id';
import type { SourceFileModel } from '@teambit/objects';
import { hasRustSnapshotTransactionClass } from '@teambit/objects';
import {
  canReadWorkspaceFilesNatively,
  canInspectWorkspaceSourcesNatively,
  isRustWorkspaceInspection,
  requestRustWorkspaceInspection,
} from '@teambit/component.sources';
import { canInspectCompFilesNatively, type CompFiles, type FilesStatus } from './workspace-component/comp-files';

export type FilesInspectionMode = 'modified' | 'status';
export type FilesInspectionSummary = {
  id: ComponentID;
  compDir: string;
  modified?: boolean;
  filesStatus?: FilesStatus;
};
export type PreparedFilesInspection = {
  prepareRead: () => { canonical: () => FilesInspectionSummary; native?: () => Promise<FilesInspectionSummary> };
  release: () => Promise<void>;
};

type CapturedFile = {
  relativePath: string;
  rawHash: string;
  linuxHash: string;
  snapshotHash: string;
  snapshotPath: string;
  bytes: number;
};
type Captured = { token: string; count: number; files: CapturedFile[] };
type Result = { modified: boolean; statuses: Array<{ relativePath: string; status: string }> };
type Options = {
  id: ComponentID;
  compDir: string;
  files: Array<{ relativePath: string; path: string }>;
  workspaceRoot: boolean;
  unchanged: () => boolean;
  loadModelFiles: () => Promise<SourceFileModel[]>;
  fallback: (contents: Buffer[], modelFiles: SourceFileModel[]) => CompFiles;
};
const readSnapshot = fs.readFileSync;
const hashSnapshot = createHash;
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const safeRelative = (value: unknown): value is string =>
  typeof value === 'string' &&
  Boolean(value) &&
  !['__proto__', 'constructor', 'prototype'].includes(value) &&
  !value.includes('\0') &&
  Buffer.from(value).toString() === value;

function ordinary(): boolean {
  return canReadWorkspaceFilesNatively() && canInspectWorkspaceSourcesNatively() && canInspectCompFilesNatively();
}

export function summarizeCompFiles(comp: CompFiles, mode: FilesInspectionMode): FilesInspectionSummary {
  return mode === 'modified'
    ? { id: comp.id, compDir: comp.compDir, modified: comp.isModified() }
    : { id: comp.id, compDir: comp.compDir, filesStatus: comp.getFilesStatus() };
}

function modelManifest(files: SourceFileModel[]): Array<{ relativePath: string; hash: string }> | undefined {
  if (!Array.isArray(files) || files.length > 4096) return undefined;
  const output: Array<{ relativePath: string; hash: string }> = [];
  const seen = new Set<string>();
  for (let index = 0; index < files.length; index += 1) {
    const file = Object.getOwnPropertyDescriptor(files, index)?.value;
    if (!file || typeof file !== 'object') return undefined;
    const relativePath = Object.getOwnPropertyDescriptor(file, 'relativePath')?.value;
    const ref = Object.getOwnPropertyDescriptor(file, 'file')?.value;
    const reference = ref && Object.getOwnPropertyDescriptor(ref, 'hash')?.value;
    if (
      !safeRelative(relativePath) ||
      seen.has(relativePath) ||
      !hasRustSnapshotTransactionClass(ref, 'Ref') ||
      !hash(reference)
    )
      return undefined;
    seen.add(relativePath);
    output.push({ relativePath, hash: reference });
  }
  return output;
}

function fromNativeResult(options: Options, mode: FilesInspectionMode, result: Result): FilesInspectionSummary {
  if (mode === 'modified') return { id: options.id, compDir: options.compDir, modified: result.modified };
  const filesStatus: FilesStatus = {};
  for (const file of result.statuses) filesStatus[file.relativePath] = file.status as FilesStatus[string];
  return { id: options.id, compDir: options.compDir, filesStatus };
}

/** A captured default continuation is used only if the helper fails after the synchronous comparison boundary. */
function defaultContinuation(captured: Captured, manifest: Array<{ relativePath: string; hash: string }>): Result {
  const statuses: Result['statuses'] = captured.files.map((file) => {
    const model = manifest.find((entry) => entry.relativePath === file.relativePath);
    return {
      relativePath: file.relativePath,
      status: !model ? 'new' : model.hash === file.linuxHash ? 'unchanged' : 'modified',
    };
  });
  for (const model of manifest)
    if (!captured.files.some((file) => file.relativePath === model.relativePath))
      statuses.push({ relativePath: model.relativePath, status: 'deleted' });
  return {
    modified:
      manifest.length > 0 &&
      (captured.files.length !== manifest.length || statuses.some((file) => file.status !== 'unchanged')),
    statuses,
  };
}

/** Return undefined only before model lookup; retain its live aliases until the caller's comparison boundary. */
export async function inspectTrackedWorkspaceFiles(
  options: Options,
  mode: FilesInspectionMode
): Promise<PreparedFilesInspection | undefined> {
  if (
    !isRustWorkspaceInspection() ||
    !ordinary() ||
    options.files.length > 4096 ||
    !options.files.every((file) => safeRelative(file.relativePath) && path.isAbsolute(file.path)) ||
    new Set(options.files.map((file) => file.relativePath)).size !== options.files.length
  )
    return undefined;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-workspace-inspection-')).catch(() => undefined);
  if (!directory) return undefined;
  let captured: Captured | undefined;
  let retained = false;
  const release = async () => {
    if (captured)
      await requestRustWorkspaceInspection(
        { kind: 'inspectionFinish', token: captured.token },
        (value): value is { finished: true } => value?.finished === true
      );
    await fs.remove(directory).catch(() => undefined);
  };
  try {
    captured = await requestRustWorkspaceInspection(
      {
        kind: 'inspectionBegin',
        files: options.files,
        workspaceRoot: options.workspaceRoot,
        snapshotDirectory: directory,
      },
      (value): value is Captured =>
        Boolean(
          value &&
            hash(value.token) &&
            value.count === options.files.length &&
            Array.isArray(value.files) &&
            value.files.length === options.files.length &&
            value.files.every(
              (file: CapturedFile, index: number) =>
                file.relativePath === options.files[index].relativePath &&
                hash(file.rawHash) &&
                hash(file.linuxHash) &&
                hash(file.snapshotHash) &&
                file.snapshotPath === path.join(directory, `${value.token}-${index}.snapshot`) &&
                Number.isSafeInteger(file.bytes) &&
                file.bytes >= 0 &&
                file.bytes <= 32 * 1024 * 1024
            )
        )
    );
    if (!captured || !ordinary() || !options.unchanged()) return undefined;
    const snapshot = captured;
    const modelFiles = await options.loadModelFiles();
    const canonical = () => {
      const contents = snapshot.files.map((file) => {
        const body = readSnapshot(file.snapshotPath);
        if (body.length !== file.bytes || hashSnapshot('sha1').update(body).digest('hex') !== file.snapshotHash)
          throw new Error('workspace inspection fallback snapshot changed');
        return body;
      });
      return summarizeCompFiles(options.fallback(contents, modelFiles), mode);
    };
    retained = true;
    return {
      release,
      prepareRead: () => {
        const manifest = ordinary() && isRustWorkspaceInspection() ? modelManifest(modelFiles) : undefined;
        if (!manifest) return { canonical };
        // Capture all default metadata before any comparison await, matching the caller's synchronous loop.
        const expectedPaths = snapshot.files.map((file) => file.relativePath);
        const currentPaths = new Set(expectedPaths);
        for (const file of manifest) if (!currentPaths.has(file.relativePath)) expectedPaths.push(file.relativePath);
        return {
          canonical,
          native: async () => {
            const result = await requestRustWorkspaceInspection(
              { kind: 'inspectionFiles', token: snapshot.token, modelFiles: manifest },
              (value): value is Result =>
                Boolean(
                  value &&
                    typeof value.modified === 'boolean' &&
                    Array.isArray(value.statuses) &&
                    value.statuses.length === expectedPaths.length &&
                    value.statuses.every(
                      (file: Result['statuses'][number], index: number) =>
                        file.relativePath === expectedPaths[index] &&
                        ['new', 'modified', 'deleted', 'unchanged'].includes(file.status)
                    )
                )
            );
            return fromNativeResult(options, mode, result || defaultContinuation(snapshot, manifest));
          },
        };
      },
    };
  } finally {
    if (!retained) await release();
  }
}
