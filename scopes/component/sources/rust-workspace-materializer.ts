import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import { availableParallelism } from 'os';
import { pMapPool } from '@teambit/toolbox.promise.map-pool';
import { resolveRustObjectImportExecutable } from '@teambit/objects';
import * as eol from '@teambit/toolbox.string.eol';
import AbstractVinyl, { defaultVinylWrite, logFileWrite } from './abstract-vinyl';
import { checkoutSourceFrame, getRustCheckoutSourceDescriptor } from './rust-checkout-source';
import {
  getRustCheckoutPlanSourceDescriptor,
  isRustCheckoutPlanSourceFile,
  captureRustCheckoutPlanWriteContinuation,
  type RustCheckoutPlanWriteContinuation,
} from './rust-checkout-plan-source';

const MAX_FILES = 64;
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_PATH = 32768;
const MAX_RESPONSE = 65536;
const stringify = JSON.stringify;
let active = 0;

type ProjectedFile = { filename: Buffer; contents: Buffer; overwrite: boolean };
type Result = {
  version: number;
  id: number;
  completed: number;
  skipped: number[];
  failed: boolean;
  [key: string]: unknown;
};

export class MaterializationSession {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly closed: Promise<void>;
  private pending = Buffer.alloc(0);
  private pendingLength = 0;
  private binaryResponse?: { response: Result; offset: number; length: number };
  private stopped = false;
  private sequence = 0;
  private waiting?: {
    id: number;
    count: number;
    resolve: (completed?: number) => void;
    validate?: (response: Result, body?: Buffer) => boolean;
    binary: boolean;
    maximum: number;
    variableCount: boolean;
  };
  private deadline?: NodeJS.Timeout;
  private killTimer?: NodeJS.Timeout;

  constructor(executable: string) {
    this.child = spawn(executable, ['--threads', String(Math.min(4, availableParallelism()))], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.stderr.resume();
    this.closed = new Promise((resolve) => {
      this.child.once('close', () => {
        this.stopped = true;
        clearTimeout(this.deadline);
        clearTimeout(this.killTimer);
        this.waiting?.resolve();
        this.waiting = undefined;
        resolve();
      });
    });
    this.child.on('error', () => this.stop());
    this.child.stdin.on('error', () => this.stop());
    this.child.stdout.on('error', () => this.stop());
    this.child.stdout.on('data', (data: Buffer) => this.accept(data));
  }

  write(files: ProjectedFile[]): Promise<number | undefined> {
    return this.request((id) => frame(id, files), files.length);
  }

  request(
    build: (id: number) => Buffer,
    count: number,
    validate?: (response: Result, body?: Buffer) => boolean,
    maximum = MAX_RESPONSE,
    variableCount = false,
    binary = false
  ): Promise<number | undefined> {
    if (this.stopped) return Promise.resolve(undefined);
    const id = ++this.sequence;
    return new Promise((resolve) => {
      this.waiting = { id, count, resolve, validate, maximum, variableCount, binary };
      this.deadline = setTimeout(() => this.stop(), 120000);
      this.child.stdin.write(build(id));
    });
  }

  async dispose(): Promise<void> {
    this.stop();
    await this.closed;
  }

  get usable(): boolean {
    return !this.stopped;
  }

  private stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.child.kill('SIGTERM');
    this.killTimer = setTimeout(() => this.child.kill('SIGKILL'), 250);
    this.killTimer.unref();
  }

  private accept(data: Buffer) {
    if (this.stopped) return;
    const maximum = this.waiting?.maximum || MAX_RESPONSE;
    const length = this.pendingLength + data.length;
    if (length > maximum) return this.stop();
    if (this.pending.length < length) {
      const grown = Buffer.allocUnsafe(Math.min(maximum, Math.max(length, this.pending.length * 2, 4096)));
      this.pending.copy(grown, 0, 0, this.pendingLength);
      this.pending = grown;
    }
    data.copy(this.pending, this.pendingLength);
    this.pendingLength = length;
    if (this.binaryResponse) return this.acceptBinary();
    const newline = data.indexOf(10);
    if (newline < 0) return;
    if (!this.waiting || (!this.waiting.binary && newline !== data.length - 1)) return this.stop();
    const offset = length - data.length + newline + 1;
    let response: Result;
    try {
      response = JSON.parse(this.pending.subarray(0, offset - 1).toString());
    } catch {
      return this.stop();
    }
    if (!validResult(response, this.waiting.id, this.waiting.count, this.waiting.variableCount)) return this.stop();
    if (this.waiting.binary) {
      const bytes = response.failed ? 0 : response.binaryBytes;
      if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes < 0 || bytes > maximum - offset)
        return this.stop();
      this.binaryResponse = { response, offset, length: offset + bytes };
      if (this.pending.length < offset + bytes) {
        const grown = Buffer.allocUnsafe(offset + bytes);
        this.pending.copy(grown, 0, 0, this.pendingLength);
        this.pending = grown;
      }
      return this.acceptBinary();
    }
    this.finishResponse(response);
  }

  private acceptBinary() {
    const state = this.binaryResponse!;
    if (this.pendingLength > state.length) return this.stop();
    if (this.pendingLength < state.length) return;
    this.finishResponse(state.response, this.pending.subarray(state.offset, state.length));
  }

  private finishResponse(response: Result, body?: Buffer) {
    if (!this.waiting) return this.stop();
    try {
      if (this.waiting.validate && !this.waiting.validate(response, body)) return this.stop();
    } catch {
      return this.stop();
    }
    const { resolve } = this.waiting;
    this.waiting = undefined;
    this.binaryResponse = undefined;
    this.pending = Buffer.alloc(0);
    this.pendingLength = 0;
    clearTimeout(this.deadline);
    resolve(response.completed);
  }
}

/** Materialize ordinary Vinyl files; preserve custom writers and the surrounding delete/link phases. */
export async function persistWorkspaceFiles(files: AbstractVinyl[], concurrency: number): Promise<boolean> {
  if (process.env.BIT_RUST_WORKSPACE_MATERIALIZATION !== 'on' || !files.length || active >= 4 || !(concurrency >= 1))
    return false;
  const snapshot = files.slice();
  if (!hasNativeChunk(snapshot, concurrency)) return false;
  const lease = acquireWorkspaceSession();
  if (!lease) return false;
  try {
    await persistFilesInSession(snapshot, concurrency, lease.session);
    return true;
  } finally {
    await lease.release();
  }
}

export function acquireWorkspaceSession():
  | { session: MaterializationSession; executable: string; release: () => Promise<void> }
  | undefined {
  if (active >= 4) return undefined;
  const executable = resolveRustObjectImportExecutable();
  if (!executable) return undefined;
  let session: MaterializationSession;
  try {
    session = new MaterializationSession(executable);
  } catch {
    return undefined;
  }
  active++;
  let released = false;
  return {
    session,
    executable,
    async release() {
      if (released) return;
      released = true;
      try {
        await session.dispose();
      } finally {
        active--;
      }
    },
  };
}

export function hasNativeChunk(files: AbstractVinyl[], concurrency: number): boolean {
  if (!(concurrency >= 1)) return false;
  const width = Number.isFinite(concurrency) ? Math.floor(concurrency) : files.length;
  for (let start = 0; start < files.length; start += width) {
    if (files.slice(start, start + width).every(eligible)) return true;
  }
  return false;
}

export async function persistFilesInSession(
  files: AbstractVinyl[],
  concurrency: number,
  session: MaterializationSession
) {
  if (!(concurrency >= 1)) {
    await pMapPool(files, (file) => file.write(), { concurrency });
    return;
  }
  // Preserve pMapPool's failure boundary: a rejected chunk must never start
  // files in the next configured concurrency chunk.
  const width = Number.isFinite(concurrency) ? Math.floor(concurrency) : files.length;
  for (let start = 0; start < files.length; start += width) {
    const chunk = files.slice(start, start + width);
    if (chunk.every(eligible)) await persistChunk(chunk, concurrency, session);
    else await pMapPool(chunk, (file) => file.write(), { concurrency });
  }
}

async function persistChunk(files: AbstractVinyl[], concurrency: number, session: MaterializationSession) {
  const continuations = files.map((file) => captureRustCheckoutPlanWriteContinuation(file));
  // The default pool starts every write in this concurrency chunk before its first asynchronous receipt.
  // Freeze planned bodies and destinations across every bounded helper frame, including later frames.
  if (continuations.every(Boolean)) continuations.forEach((write) => write!.log());
  const persistSuffix = (start: number) =>
    pMapPool(
      files.slice(start).map((file, offset) => ({ file, write: continuations[start + offset] })),
      async ({ file, write }) => {
        if (write) await write.persist();
        else await file.write();
      },
      { concurrency }
    );
  let index = 0;
  while (index < files.length) {
    const planned = projectPlanBatch(continuations, index);
    if (planned) {
      for (let offset = 0; offset < planned.files.length; offset++) {
        continuations[index + offset]!.log();
      }
      const completed = await persistPlanBatch(planned, session);
      if (completed === undefined || completed < planned.files.length) {
        await session.dispose();
        await persistSuffix(index + (completed || 0));
        return;
      }
      index += completed;
      continue;
    }
    const source = projectSourceBatch(files, index);
    if (source) {
      for (let offset = 0; offset < source.files.length; offset++) {
        const file = files[index + offset];
        logFileWrite(file.path, file.override, file.verbose);
      }
      const completed = await session.request(
        (id) => checkoutSourceFrame('BWC1', id, source.objectsDirectory, source.files),
        source.files.length
      );
      if (completed === undefined || completed < source.files.length) {
        await session.dispose();
        await persistSuffix(index + (completed || 0));
        return;
      }
      index += completed;
      continue;
    }
    const batch = projectBatch(files, index);
    if (!batch.length) {
      await persistSuffix(index);
      return;
    }
    for (let offset = 0; offset < batch.length; offset++) {
      const file = files[index + offset];
      logFileWrite(file.path, file.override, file.verbose);
    }
    const completed = await session.write(batch);
    if (completed === undefined || completed < batch.length) {
      // Reap before replay: an unacknowledged in-place write may still be running.
      await session.dispose();
      await persistSuffix(index + (completed || 0));
      return;
    }
    index += completed;
  }
}

function projectPlanBatch(writes: Array<RustCheckoutPlanWriteContinuation | undefined>, start: number) {
  if (
    Object.getOwnPropertyDescriptor(JSON, 'stringify')?.value !== stringify ||
    Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON') ||
    Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON')
  )
    return undefined;
  const first = writes[start]?.descriptor;
  if (!first) return undefined;
  const batch: Array<{ planIndex: number; path: string; overwrite: true; eol: 'auto' }> = [];
  for (const write of writes.slice(start, start + MAX_FILES)) {
    if (!write || write.descriptor.token !== first.token || write.descriptor.mergeOwnerToken !== first.mergeOwnerToken)
      break;
    batch.push({ planIndex: write.descriptor.planIndex, path: write.path, overwrite: true, eol: 'auto' });
  }
  return { token: first.token, mergeOwnerToken: first.mergeOwnerToken, files: batch };
}

async function persistPlanBatch(
  plan: NonNullable<ReturnType<typeof projectPlanBatch>>,
  session: MaterializationSession
): Promise<number | undefined> {
  const input = plan.mergeOwnerToken
    ? { kind: 'mergeMaterialize', token: plan.mergeOwnerToken, planToken: plan.token, files: plan.files }
    : { kind: 'checkoutMaterialize', token: plan.token, files: plan.files };
  const bytes = Buffer.from(stringify(input));
  if (bytes.length > 4 * 1024 * 1024) return undefined;
  let completed: number | undefined;
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
      if (response.failed) return true;
      const result = response.data as { completed?: number; skipped?: unknown; failed?: unknown } | undefined;
      if (
        response.completed !== 1 ||
        !result ||
        !Number.isSafeInteger(result.completed) ||
        result.completed! < 0 ||
        result.completed! > plan.files.length ||
        !Array.isArray(result.skipped) ||
        result.skipped.length !== 0 ||
        result.failed !== result.completed! < plan.files.length
      )
        return false;
      completed = result.completed;
      return true;
    }
  );
  return completed;
}

function projectSourceBatch(files: AbstractVinyl[], start: number) {
  const first = getRustCheckoutSourceDescriptor(files[start]);
  if (!first || !ordinarySourceFile(files[start])) return undefined;
  const batch: { hash: string; destination: string }[] = [];
  for (const file of files.slice(start, start + MAX_FILES)) {
    const descriptor = getRustCheckoutSourceDescriptor(file);
    if (!descriptor || descriptor.objectsDirectory !== first.objectsDirectory || !ordinarySourceFile(file)) break;
    batch.push({ hash: descriptor.hash, destination: file.path });
  }
  return { objectsDirectory: first.objectsDirectory, files: batch };
}

function ordinarySourceFile(file: AbstractVinyl): boolean {
  return (
    file instanceof AbstractVinyl &&
    file.write === defaultVinylWrite &&
    file.override === true &&
    typeof file.verbose === 'boolean' &&
    path.isAbsolute(file.path) &&
    !file.path.includes('\0') &&
    Buffer.from(file.path).toString() === file.path &&
    Buffer.byteLength(file.path) <= MAX_PATH
  );
}

function projectBatch(files: AbstractVinyl[], start: number): ProjectedFile[] {
  const batch: ProjectedFile[] = [];
  let bytes = 0;
  for (const file of files.slice(start, start + MAX_FILES)) {
    if (getRustCheckoutSourceDescriptor(file) || getRustCheckoutPlanSourceDescriptor(file)) break;
    let projected: ProjectedFile | undefined;
    try {
      projected = project(file);
    } catch {
      break;
    }
    if (!projected || bytes + projected.filename.length + projected.contents.length > MAX_BYTES) break;
    batch.push(projected);
    bytes += projected.filename.length + projected.contents.length;
  }
  return batch;
}

function project(file: AbstractVinyl): ProjectedFile | undefined {
  if (!eligible(file)) return undefined;
  const filename = Buffer.from(file.path);
  // Keep the established isbinaryfile and host newline policy byte-for-byte.
  const contents = eol.auto(file.contents) as Buffer;
  return { filename, contents, overwrite: file.override };
}

function eligible(file: AbstractVinyl): boolean {
  try {
    return ordinaryFile(file);
  } catch {
    return false;
  }
}

function ordinaryFile(file: AbstractVinyl): boolean {
  if (getRustCheckoutPlanSourceDescriptor(file)) return ordinarySourceFile(file);
  if (isRustCheckoutPlanSourceFile(file)) return false;
  if (getRustCheckoutSourceDescriptor(file)) return ordinarySourceFile(file);
  if (
    !(file instanceof AbstractVinyl) ||
    file.write !== defaultVinylWrite ||
    !Buffer.isBuffer(file.contents) ||
    file.override !== true ||
    typeof file.verbose !== 'boolean'
  )
    return false;
  const filename = Buffer.from(file.path);
  if (
    !path.isAbsolute(file.path) ||
    file.path.includes('\0') ||
    filename.toString() !== file.path ||
    filename.length > MAX_PATH ||
    file.contents.length + filename.length > MAX_BYTES
  )
    return false;
  return true;
}

function frame(id: number, files: ProjectedFile[]): Buffer {
  const header = Buffer.alloc(12);
  header.write('BWM1');
  header.writeUInt32BE(id, 4);
  header.writeUInt32BE(files.length, 8);
  const parts: Buffer[] = [header];
  for (const file of files) {
    const name = Buffer.alloc(4);
    name.writeUInt32BE(file.filename.length);
    const metadata = Buffer.alloc(8);
    metadata.writeUInt32BE(file.overwrite ? 1 : 0);
    metadata.writeUInt32BE(file.contents.length, 4);
    parts.push(name, file.filename, metadata, file.contents);
  }
  return Buffer.concat(parts);
}

function validResult(response: Result, id: number, count: number, variableCount: boolean): boolean {
  if (
    !response ||
    response.version !== 1 ||
    response.id !== id ||
    !Number.isInteger(response.completed) ||
    response.completed < 0 ||
    response.completed > count
  )
    return false;
  if (
    typeof response.failed !== 'boolean' ||
    (variableCount ? response.failed && response.completed !== 0 : response.failed !== response.completed < count) ||
    !Array.isArray(response.skipped) ||
    response.skipped.length !== 0
  )
    return false;
  // Every submitted file has overwrite=true; a skipped acknowledgement would
  // silently accept a helper that did not materialize the requested bytes.
  return true;
}
