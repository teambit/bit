import fs from 'fs';
import { promisify } from 'util';

const open = promisify(fs.open);
const read = promisify(fs.read);
const close = promisify(fs.close);
const stat = promisify(fs.fstat);
const openSync = fs.openSync;
const readSync = fs.readSync;
const closeSync = fs.closeSync;
const statSync = fs.fstatSync;

function allocate(offset: number, bytes: number): Buffer {
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(bytes) ||
    bytes < 0 ||
    offset + bytes > 32 * 1024 * 1024
  )
    throw new Error('invalid private body range');
  return Buffer.allocUnsafe(bytes);
}

type PendingRange = {
  offset: number;
  body: Buffer;
  resolve: (body: Buffer) => void;
  reject: (error: unknown) => void;
};
type ReadBatch = { ranges: PendingRange[]; bytes: number };
const pending = new Map<string, ReadBatch>();
const maximumBytes = 32 * 1024 * 1024;
const copy = Buffer.prototype.copy;
const allocateBuffer = Buffer.allocUnsafe;
const enqueue = queueMicrotask;
const promiseConstructor = Promise;
const mapGet = Map.prototype.get;
const mapSet = Map.prototype.set;

/** The synchronous enqueue prefix must not call user replacements between guarded cache reads. */
export function canBatchRustBodyRangeReads(): boolean {
  return (
    Object.getOwnPropertyDescriptor(Buffer, 'allocUnsafe')?.value === allocateBuffer &&
    Object.getOwnPropertyDescriptor(globalThis, 'queueMicrotask')?.value === enqueue &&
    Object.getOwnPropertyDescriptor(globalThis, 'Promise')?.value === promiseConstructor &&
    Object.getOwnPropertyDescriptor(Map.prototype, 'get')?.value === mapGet &&
    Object.getOwnPropertyDescriptor(Map.prototype, 'set')?.value === mapSet
  );
}

async function readRange(filename: string, offset: number, body: Buffer): Promise<Buffer> {
  const descriptor = await open(filename, 'r');
  try {
    const metadata = await stat(descriptor);
    if (!metadata.isFile() || metadata.size < offset + body.length) throw new Error('private body range truncated');
    let position = 0;
    while (position < body.length) {
      const { bytesRead } = await read(descriptor, body, position, body.length - position, offset + position);
      if (!bytesRead) throw new Error('private body range truncated');
      position += bytesRead;
    }
    return body;
  } finally {
    await close(descriptor);
  }
}

async function flush(filename: string, batch: ReadBatch): Promise<void> {
  if (pending.get(filename) === batch) pending.delete(filename);
  if (batch.ranges.length >= 8) {
    const start = Math.min(...batch.ranges.map((range) => range.offset));
    const end = Math.max(...batch.ranges.map((range) => range.offset + range.body.length));
    try {
      const bytes = await readRange(filename, start, allocate(start, end - start));
      for (const range of batch.ranges) {
        copy.call(bytes, range.body, 0, range.offset - start, range.offset - start + range.body.length);
        range.resolve(range.body);
      }
      return;
    } catch {
      // A failed speculative read must not turn a valid prefix into a failed load.
      // Retry each private range independently before publishing any result.
    }
  }
  await Promise.all(
    batch.ranges.map((range) => readRange(filename, range.offset, range.body).then(range.resolve, range.reject))
  );
}

/** Coalesce concurrent immutable spool slices; each logical read owns its buffer and verifies its body hash. */
export async function readRustBodyRange(filename: string, offset: number, bytes: number): Promise<Buffer> {
  const body = allocate(offset, bytes);
  let batch = pending.get(filename);
  if (!batch || batch.ranges.length >= 4096 || batch.bytes + bytes > maximumBytes) {
    batch = { ranges: [], bytes: 0 };
    pending.set(filename, batch);
    const captured = batch;
    queueMicrotask(() => void flush(filename, captured));
  }
  batch.bytes += bytes;
  return new Promise<Buffer>((resolve, reject) => batch!.ranges.push({ offset, body, resolve, reject }));
}

/** Synchronous counterpart for public lazy getters and captured write continuations. */
export function readRustBodyRangeSync(filename: string, offset: number, bytes: number): Buffer {
  const body = allocate(offset, bytes);
  const descriptor = openSync(filename, 'r');
  try {
    const metadata = statSync(descriptor);
    if (!metadata.isFile() || metadata.size < offset + bytes) throw new Error('private body range truncated');
    let position = 0;
    while (position < bytes) {
      const bytesRead = readSync(descriptor, body, position, bytes - position, offset + position);
      if (!bytesRead) throw new Error('private body range truncated');
      position += bytesRead;
    }
    return body;
  } finally {
    closeSync(descriptor);
  }
}
