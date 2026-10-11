import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import { pMapPool } from '@teambit/toolbox.promise.map-pool';
import { resolveRustObjectImportExecutable } from '@teambit/objects';
import * as eol from '@teambit/toolbox.string.eol';
import AbstractVinyl, { defaultVinylWrite, logFileWrite } from './abstract-vinyl';
import { checkoutSourceFrame, getRustCheckoutSourceDescriptor } from './rust-checkout-source';

const MAX_FILES = 64;
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_PATH = 32768;
const MAX_RESPONSE = 65536;
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
  private stopped = false;
  private sequence = 0;
  private waiting?: {
    id: number;
    count: number;
    resolve: (completed?: number) => void;
    validate?: (response: Result) => boolean;
    maximum: number;
    variableCount: boolean;
  };
  private deadline?: NodeJS.Timeout;
  private killTimer?: NodeJS.Timeout;

  constructor(executable: string) {
    this.child = spawn(executable, ['--threads', '1'], { stdio: ['pipe', 'pipe', 'pipe'] });
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
    validate?: (response: Result) => boolean,
    maximum = MAX_RESPONSE,
    variableCount = false
  ): Promise<number | undefined> {
    if (this.stopped) return Promise.resolve(undefined);
    const id = ++this.sequence;
    return new Promise((resolve) => {
      this.waiting = { id, count, resolve, validate, maximum, variableCount };
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
    this.pending = Buffer.concat([this.pending, data]);
    if (this.pending.length > (this.waiting?.maximum || MAX_RESPONSE)) return this.stop();
    const newline = this.pending.indexOf(10);
    if (newline < 0) return;
    if (!this.waiting || newline !== this.pending.length - 1) return this.stop();
    let response: Result;
    try {
      response = JSON.parse(this.pending.subarray(0, newline).toString());
    } catch {
      return this.stop();
    }
    if (!validResult(response, this.waiting.id, this.waiting.count, this.waiting.variableCount)) return this.stop();
    try {
      if (this.waiting.validate && !this.waiting.validate(response)) return this.stop();
    } catch {
      return this.stop();
    }
    const { resolve } = this.waiting;
    this.waiting = undefined;
    this.pending = Buffer.alloc(0);
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
  let index = 0;
  while (index < files.length) {
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
        await pMapPool(files.slice(index + (completed || 0)), (file) => file.write(), { concurrency });
        return;
      }
      index += completed;
      continue;
    }
    const batch = projectBatch(files, index);
    if (!batch.length) {
      await pMapPool(files.slice(index), (file) => file.write(), { concurrency });
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
      const remaining = files.slice(index + (completed || 0));
      await pMapPool(remaining, (file) => file.write(), { concurrency });
      return;
    }
    index += completed;
  }
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
    if (getRustCheckoutSourceDescriptor(file)) break;
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
