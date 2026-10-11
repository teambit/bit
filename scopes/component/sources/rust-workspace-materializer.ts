import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import { pMapPool } from '@teambit/toolbox.promise.map-pool';
import { resolveRustObjectImportExecutable } from '@teambit/objects';
import * as eol from '@teambit/toolbox.string.eol';
import AbstractVinyl, { defaultVinylWrite, logFileWrite } from './abstract-vinyl';

const MAX_FILES = 64;
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_PATH = 32768;
const MAX_RESPONSE = 65536;
let active = 0;

type ProjectedFile = { filename: Buffer; contents: Buffer; overwrite: boolean };
type Result = { version: number; id: number; completed: number; skipped: number[]; failed: boolean };

class MaterializationSession {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly closed: Promise<void>;
  private pending = Buffer.alloc(0);
  private stopped = false;
  private sequence = 0;
  private waiting?: { id: number; count: number; resolve: (completed?: number) => void };
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
    if (this.stopped) return Promise.resolve(undefined);
    const id = ++this.sequence;
    return new Promise((resolve) => {
      this.waiting = { id, count: files.length, resolve };
      this.deadline = setTimeout(() => this.stop(), 120000);
      this.child.stdin.write(frame(id, files));
    });
  }

  async dispose(): Promise<void> {
    this.stop();
    await this.closed;
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
    if (this.pending.length > MAX_RESPONSE) return this.stop();
    const newline = this.pending.indexOf(10);
    if (newline < 0) return;
    if (!this.waiting || newline !== this.pending.length - 1) return this.stop();
    let response: Result;
    try {
      response = JSON.parse(this.pending.subarray(0, newline).toString());
    } catch {
      return this.stop();
    }
    if (!validResult(response, this.waiting.id, this.waiting.count)) return this.stop();
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
  const executable = resolveRustObjectImportExecutable();
  if (!executable) return false;
  active++;
  let session: MaterializationSession;
  try {
    session = new MaterializationSession(executable);
  } catch {
    active--;
    return false;
  }
  try {
    await persist(snapshot, concurrency, session);
    return true;
  } finally {
    await session.dispose();
    active--;
  }
}

function hasNativeChunk(files: AbstractVinyl[], concurrency: number): boolean {
  const width = Number.isFinite(concurrency) ? Math.floor(concurrency) : files.length;
  for (let start = 0; start < files.length; start += width) {
    if (files.slice(start, start + width).every(eligible)) return true;
  }
  return false;
}

async function persist(files: AbstractVinyl[], concurrency: number, session: MaterializationSession) {
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

function projectBatch(files: AbstractVinyl[], start: number): ProjectedFile[] {
  const batch: ProjectedFile[] = [];
  let bytes = 0;
  for (const file of files.slice(start, start + MAX_FILES)) {
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

function validResult(response: Result, id: number, count: number): boolean {
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
    response.failed !== response.completed < count ||
    !Array.isArray(response.skipped) ||
    response.skipped.length !== 0
  )
    return false;
  // Every submitted file has overwrite=true; a skipped acknowledgement would
  // silently accept a helper that did not materialize the requested bytes.
  return true;
}
