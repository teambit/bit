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

/** Read one immutable private spool slice; callers verify its body hash before use. */
export async function readRustBodyRange(filename: string, offset: number, bytes: number): Promise<Buffer> {
  const body = allocate(offset, bytes);
  const descriptor = await open(filename, 'r');
  try {
    const metadata = await stat(descriptor);
    if (!metadata.isFile() || metadata.size < offset + bytes) throw new Error('private body range truncated');
    let position = 0;
    while (position < bytes) {
      const { bytesRead } = await read(descriptor, body, position, bytes - position, offset + position);
      if (!bytesRead) throw new Error('private body range truncated');
      position += bytesRead;
    }
    return body;
  } finally {
    await close(descriptor);
  }
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
