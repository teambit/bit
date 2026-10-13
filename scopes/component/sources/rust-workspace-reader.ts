import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { createHash } from 'crypto';
import { types } from 'util';
import {
  withRustWorkspaceInspection,
  requestRustWorkspaceInspection,
  isRustWorkspaceInspection,
} from './rust-workspace-inspection';
import { canHashSourceNatively, registerRustSnapshotFunctionReference } from '@teambit/objects';
import type AbstractVinyl from './abstract-vinyl';
import { indexRustWorkspaceFiles } from './rust-workspace-file-index';
import { getRustCheckoutSourceDescriptor } from './rust-checkout-source';
import { withWorkspaceSession } from './rust-workspace-persistence';
import { isRustWorkspaceEngine, workspaceEngineIdentity } from './rust-workspace-engine';

const MAX_FILES = 4096;
const MAX_INPUT = 4 * 1024 * 1024;
const MAX_OUTPUT = 32 * 1024 * 1024;
const MAX_BYTES = 8 * 1024 * 1024;
const readReceipts = new WeakMap<RustWorkspaceRead, { owner: object; token: number; value: RustWorkspaceRead }>();
const receiptCompare = Buffer.compare;
const receiptCopy = Buffer.from;
const receiptIsBuffer = Buffer.isBuffer;
import {
  getRustWorkspaceFileDescriptor,
  getRustWorkspaceMergeDescriptor,
  hasOrdinaryWorkspaceProperties,
  type RustWorkspaceRead,
} from './rust-workspace-identity';
export {
  registerRustWorkspaceFile,
  registerRustWorkspaceBitmapFile,
  getRustWorkspaceFileDescriptor,
  getRustWorkspaceSource,
} from './rust-workspace-identity';
export type { RustWorkspaceRead } from './rust-workspace-identity';
export type RustWorkspaceDiff = {
  relativePath: string;
  fromContent: string;
  toContent: string;
  rawDiff: string;
  same: boolean;
};
registerRustSnapshotFunctionReference('WorkspaceReadReceipt', getRustWorkspaceReadReceipt);

/** Only actual helper read results can confer ownership of an operation-local snapshot. */
export function getRustWorkspaceReadReceipt(read: RustWorkspaceRead): { owner: object; token: number } | undefined {
  const receipt = readReceipts.get(read);
  if (!receipt || receipt.owner !== workspaceEngineIdentity() || !isRustWorkspaceEngine()) return undefined;
  const fields = Object.getOwnPropertyDescriptors(read);
  for (const key of ['path', 'hash', 'linuxHash', 'snapshotHash'] as const) {
    if (!fields[key] || !('value' in fields[key]) || fields[key].value !== receipt.value[key]) return undefined;
  }
  const contents = fields.contents?.value;
  if (
    !receiptIsBuffer(contents) ||
    types.isProxy(contents) ||
    Object.getPrototypeOf(contents) !== Buffer.prototype ||
    ['length', 'byteLength', 'byteOffset', 'buffer'].some((key) => Object.hasOwn(contents, key)) ||
    receiptCompare(contents, receipt.value.contents) !== 0
  )
    return undefined;
  return { owner: receipt.owner, token: receipt.token };
}
const hashString = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const validPath = (value: string) =>
  path.isAbsolute(value) &&
  !value.includes('\0') &&
  Buffer.byteLength(value) <= 32768 &&
  Buffer.from(value).toString() === value;

async function request<T>(
  input: unknown,
  count: number,
  validate: (data: unknown, completed: number, body?: Buffer) => data is T,
  binary = false
): Promise<T | undefined> {
  if (process.env.BIT_RUST_CLIENT_VCS !== 'on') return undefined;
  const bytes = Buffer.from(JSON.stringify(input));
  if (bytes.length > MAX_INPUT) return undefined;
  let result: T | undefined;
  await withWorkspaceSession(async (session) => {
    await session.request(
      (id) => {
        const header = Buffer.alloc(12);
        header.write('BWS1');
        header.writeUInt32BE(id, 4);
        header.writeUInt32BE(bytes.length, 8);
        return Buffer.concat([header, bytes]);
      },
      count,
      (response, body) => {
        if (response.failed) return true;
        if (!validate(response.data, response.completed, body)) return false;
        result = response.data;
        return true;
      },
      MAX_OUTPUT,
      (input as { kind?: string })?.kind === 'scan',
      binary
    );
  });
  return result;
}

/** Enumerate candidates only; ignore files and component ownership remain with the bitmap adapter. */
export async function scanRustWorkspace(
  root: string,
  excludeDirs: string[],
  workspaceRoot: boolean
): Promise<string[] | undefined> {
  if (!validPath(root) || !excludeDirs.every(validPath)) return undefined;
  const result = await request(
    { kind: 'scan', root, excludeDirs, workspaceRoot },
    MAX_FILES,
    (value, completed): value is { paths: string[] } => {
      const paths = (value as { paths?: unknown })?.paths;
      return (
        Array.isArray(paths) &&
        paths.length === completed &&
        paths.length <= MAX_FILES &&
        new Set(paths).size === paths.length &&
        paths.every((filename) => {
          if (typeof filename !== 'string' || !validPath(filename)) return false;
          const relative = path.relative(root, filename);
          return (
            Boolean(relative) &&
            !relative.startsWith(`..${path.sep}`) &&
            relative !== '..' &&
            !path.isAbsolute(relative)
          );
        })
      );
    }
  );
  return result?.paths;
}

/** Read and identify a complete file set before exposing any native snapshot. */
export async function readRustWorkspaceFiles(paths: string[]): Promise<RustWorkspaceRead[] | undefined> {
  if (!paths.length || paths.length > MAX_FILES || !paths.every(validPath)) return undefined;
  type Wire = {
    path: string;
    offset: number;
    bytes: number;
    hash: string;
    linuxHash: string;
    snapshotHash: string;
    readToken?: number;
  };
  const owner = isRustWorkspaceEngine() ? workspaceEngineIdentity() : undefined;
  let output: RustWorkspaceRead[] | undefined;
  await request(
    { kind: 'read', files: paths, binary: true, ...(owner ? { retain: true } : {}) },
    paths.length,
    (value, completed, body): value is { files: Wire[] } => {
      const files = (value as { files?: unknown })?.files;
      if (!body || !Array.isArray(files) || files.length !== paths.length || completed !== paths.length) return false;
      let bytes = 0;
      for (const [index, file] of files.entries()) {
        if (
          !file ||
          file.path !== paths[index] ||
          !hashString(file.hash) ||
          !hashString(file.linuxHash) ||
          !hashString(file.snapshotHash) ||
          (file.readToken !== undefined && (!Number.isSafeInteger(file.readToken) || file.readToken <= 0)) ||
          file.offset !== bytes ||
          !Number.isSafeInteger(file.bytes) ||
          file.bytes < 0
        )
          return false;
        bytes += file.bytes;
        if (bytes > MAX_BYTES) return false;
      }
      if (bytes !== body.length) return false;
      output = files.map((file) => ({
        path: file.path,
        hash: file.hash,
        linuxHash: file.linuxHash,
        snapshotHash: file.snapshotHash,
        contents: Buffer.from(body.subarray(file.offset, file.offset + file.bytes)),
      }));
      if (owner)
        output.forEach((read, index) => {
          const token = files[index].readToken;
          if (token !== undefined)
            readReceipts.set(read, { owner, token, value: { ...read, contents: receiptCopy(read.contents) } });
        });
      return true;
    },
    true
  );
  return output;
}

export async function compareRustVersionIds(left: string, right: string): Promise<boolean | undefined> {
  const result = await request(
    { kind: 'compare', left, right },
    1,
    (value, completed): value is { modified: boolean } =>
      completed === 1 && typeof (value as { modified?: unknown })?.modified === 'boolean'
  );
  return result?.modified;
}

/** Rust reads stored Sources and verified workspace snapshots directly; no body round trip for Git. */
export async function getRustFilesDiff(
  filesA: AbstractVinyl[],
  filesB: AbstractVinyl[],
  fileNameAttribute = 'relative',
  color = true,
  gitExecutable = 'git'
): Promise<RustWorkspaceDiff[] | undefined> {
  if (process.env.BIT_RUST_CLIENT_VCS !== 'on' || fileNameAttribute !== 'relative' || !canHashSourceNatively())
    return undefined;
  const snapshotA = [...filesA];
  const snapshotB = [...filesB];
  const files = [...snapshotA, ...snapshotB];
  if (files.some((file) => !hasOrdinaryWorkspaceProperties(file))) return undefined;
  const observedPaths = files.map((file) => file.relative);
  const paths = [...new Set(observedPaths)];
  const indexedA =
    snapshotA.length >= 8 ? indexRustWorkspaceFiles(snapshotA, observedPaths.slice(0, snapshotA.length)) : undefined;
  const indexedB =
    snapshotB.length >= 8 ? indexRustWorkspaceFiles(snapshotB, observedPaths.slice(snapshotA.length)) : undefined;
  if (!paths.length || paths.length > MAX_FILES) return undefined;
  const input = (file: AbstractVinyl | undefined) => {
    if (!file) return undefined;
    const source = getRustCheckoutSourceDescriptor(file);
    if (source) return { kind: 'source', ...source };
    const workspace = getRustWorkspaceFileDescriptor(file);
    return workspace && { kind: 'workspace', ...workspace };
  };
  const projected = paths.map((relativePath) => {
    const a = indexedA ? indexedA.get(relativePath) : filesA.find((file) => file.relative === relativePath);
    const b = indexedB ? indexedB.get(relativePath) : filesB.find((file) => file.relative === relativePath);
    return { relativePath, left: input(a), right: input(b), a, b };
  });
  if (projected.some((file) => (file.a && !file.left) || (file.b && !file.right))) return undefined;
  const valid = () =>
    filesA.length === snapshotA.length &&
    filesB.length === snapshotB.length &&
    filesA.every((file, index) => file === snapshotA[index]) &&
    filesB.every((file, index) => file === snapshotB[index]) &&
    projected.every(
      (file) =>
        JSON.stringify(input(file.a)) === JSON.stringify(file.left) &&
        JSON.stringify(input(file.b)) === JSON.stringify(file.right) &&
        (!file.a || file.a.relative === file.relativePath) &&
        (!file.b || file.b.relative === file.relativePath)
    );
  const inspection = await withRustWorkspaceInspection(async () => {
    if (!isRustWorkspaceInspection() || !snapshotA.length || !snapshotB.length) return undefined;
    const left = snapshotA.map((file) => ({
      relativePath: file.relative,
      descriptor: getRustCheckoutSourceDescriptor(file),
    }));
    const right = snapshotB.map((file) => ({
      relativePath: file.relative,
      descriptor: getRustWorkspaceMergeDescriptor(file),
      file,
    }));
    const objectsDirectory = left[0].descriptor?.objectsDirectory;
    if (
      !objectsDirectory ||
      left.some((file) => !file.descriptor || file.descriptor.objectsDirectory !== objectsDirectory) ||
      right.some((file) => !file.descriptor || !Buffer.isBuffer(file.file.contents)) ||
      new Set(left.map((file) => file.relativePath)).size !== left.length ||
      new Set(right.map((file) => file.relativePath)).size !== right.length
    )
      return undefined;
    // Bind private native captures to the caller's pre-LF bytes as well as its verified disk revision.
    const current = right.map((file) => ({
      relativePath: file.relativePath,
      path: file.descriptor!.path,
      rawHash: file.descriptor!.hash,
      snapshotHash: createHash('sha1').update(file.file.contents).digest('hex'),
      ...(file.descriptor!.readToken ? { readToken: file.descriptor!.readToken } : {}),
    }));
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-workspace-diff-')).catch(() => undefined);
    if (!directory) return undefined;
    let token: string | undefined;
    try {
      const captured = await requestRustWorkspaceInspection(
        {
          kind: 'inspectionBegin',
          files: current,
          workspaceRoot: false,
          snapshotDirectory: directory,
          memoryOnly: true,
        },
        (
          value
        ): value is {
          token: string;
          count: number;
          files: Array<{ relativePath: string; rawHash: string; snapshotHash: string }>;
        } =>
          Boolean(
            value &&
              hashString(value.token) &&
              value.count === current.length &&
              Array.isArray(value.files) &&
              value.files.length === current.length &&
              value.files.every(
                (file, index) =>
                  file.relativePath === current[index].relativePath &&
                  file.rawHash === current[index].rawHash &&
                  file.snapshotHash === current[index].snapshotHash
              )
          )
      );
      if (!captured) return undefined;
      token = captured.token;
      if (!valid()) return undefined;
      const result = await requestRustWorkspaceInspection(
        {
          kind: 'inspectionDiff',
          token,
          objectsDirectory,
          modelFiles: left.map((file) => ({ relativePath: file.relativePath, hash: file.descriptor!.hash })),
          gitExecutable,
          color,
        },
        (value): value is { files: RustWorkspaceDiff[] } =>
          Boolean(
            value &&
              Array.isArray(value.files) &&
              value.files.length === paths.length &&
              value.files.every(
                (file, index) =>
                  file.relativePath === paths[index] &&
                  typeof file.fromContent === 'string' &&
                  typeof file.toContent === 'string' &&
                  typeof file.rawDiff === 'string' &&
                  typeof file.same === 'boolean'
              )
          )
      );
      return result && valid() ? result.files : undefined;
    } finally {
      if (token)
        await requestRustWorkspaceInspection(
          { kind: 'inspectionFinish', token },
          (value): value is { finished: true } => value?.finished === true
        );
      await fs.remove(directory).catch(() => undefined);
    }
  });
  if (inspection) return inspection;
  const result = await request(
    {
      kind: 'diff',
      files: projected.map(({ relativePath, left, right }) => ({ relativePath, left, right })),
      gitExecutable,
      color,
    },
    paths.length,
    (value, completed): value is { files: RustWorkspaceDiff[] } => {
      const outputs = (value as { files?: unknown })?.files;
      return (
        Array.isArray(outputs) &&
        outputs.length === paths.length &&
        completed === paths.length &&
        outputs.every(
          (file, index) =>
            file?.relativePath === paths[index] &&
            typeof file.fromContent === 'string' &&
            typeof file.toContent === 'string' &&
            typeof file.rawDiff === 'string' &&
            typeof file.same === 'boolean'
        )
      );
    }
  );
  return result && valid() ? result.files : undefined;
}

/** Compare verified identities in one native first-match path index. */
export async function compareRustFileStatuses(
  target: Array<{ relativePath: string; hash: string }>,
  current: Array<{ relativePath: string; hash: string }>
): Promise<boolean[] | undefined> {
  const result = await request(
    { kind: 'fileStatus', target, current },
    target.length,
    (value, completed): value is { unchanged: boolean[] } => {
      const rows = (value as { unchanged?: unknown })?.unchanged;
      return (
        completed === target.length &&
        Array.isArray(rows) &&
        rows.length === target.length &&
        rows.every((row) => typeof row === 'boolean')
      );
    }
  );
  return result?.unchanged;
}
