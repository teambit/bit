import { spawn } from 'child_process';
import { readdir } from 'fs/promises';
import path from 'path';
import { resolveRustObjectImportExecutable } from './rust-object-discovery';
import { nativeObjectHelperEnabled, withObjectHelperSlot } from './rust-object-inventory';
import { type NativeObjectHeader, parseNativeObjectHeader } from './rust-object-reader';

export type NativeDirectoryEntry = { hash: string; header?: NativeObjectHeader };
const MAX_LINE = 4 * 1024 * 1024;
const MAX_OBJECTS = 1048576;

export function nativeTraversalEnabled(): boolean {
  return process.env.BIT_RUST_OBJECT_TRAVERSAL !== 'off' && nativeObjectHelperEnabled(1, 1, true);
}

export async function nativeObjectDirectory(
  directory: string,
  headers = false
): Promise<NativeDirectoryEntry[] | undefined> {
  if (!nativeTraversalEnabled() || !path.isAbsolute(directory)) return undefined;
  if (headers && process.env.BIT_RUST_OBJECT_HEADERS === 'off') return undefined;
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const prefixes: string[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.isFile()) continue;
      if (!entry.isDirectory() || !/^[a-f0-9]{2}$/.test(entry.name)) return undefined;
      prefixes.push(entry.name);
    }
    if (prefixes.length < 256) return undefined;
    prefixes.sort().reverse();
    return await withObjectHelperSlot(() => walk(directory, prefixes, headers));
  } catch {
    return undefined;
  }
}

class DirectoryFrames {
  readonly objects: NativeDirectoryEntry[] = [];
  done = false;
  private sequence = 0;
  private previous = 'g';
  private readonly prefixes: Set<string>;

  constructor(
    prefixes: string[],
    private readonly headers: boolean
  ) {
    this.prefixes = new Set(prefixes);
  }

  accept(line: Buffer): boolean {
    try {
      const frame = JSON.parse(line.toString('utf8'));
      if (
        this.done ||
        frame.version !== 1 ||
        frame.id !== 1 ||
        frame.sequence !== this.sequence++ ||
        frame.headers !== this.headers ||
        typeof frame.done !== 'boolean' ||
        frame.fallback !== false ||
        !Array.isArray(frame.objects) ||
        frame.objects.length > 4096
      )
        return false;
      if (frame.done) {
        this.done = frame.objects.length === 0;
        return this.done;
      }
      if (!frame.objects.length || this.objects.length + frame.objects.length > MAX_OBJECTS) return false;
      for (const object of frame.objects) {
        if (
          !object ||
          typeof object.hash !== 'string' ||
          !/^[a-f0-9]{40}$/.test(object.hash) ||
          !this.prefixes.has(object.hash.slice(0, 2)) ||
          object.hash >= this.previous
        )
          return false;
        const header = object.header === null ? undefined : parseNativeObjectHeader(object.header);
        if (object.header !== null && (!this.headers || !header)) return false;
        this.previous = object.hash;
        this.objects.push({ hash: object.hash, header });
      }
      return true;
    } catch {
      return false;
    }
  }
}

function walk(directory: string, prefixes: string[], headers: boolean): Promise<NativeDirectoryEntry[] | undefined> {
  const executable = resolveRustObjectImportExecutable();
  if (!executable) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const child = spawn(executable, ['--objects-dir', directory], {
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const parser = new DirectoryFrames(prefixes, headers);
    let pending = Buffer.alloc(0);
    let failed = false;
    let killTimer: NodeJS.Timeout | undefined;
    const stop = () => {
      if (failed) return;
      failed = true;
      if (!child.pid || child.pid <= 0) return;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 250);
      killTimer.unref();
    };
    const deadline = setTimeout(stop, 120000);
    child.on('error', stop);
    child.stdin.on('error', stop);
    child.stdout.on('error', stop);
    child.stdout.on('data', (chunk: Buffer) => {
      if (failed) return;
      pending = Buffer.concat([pending, chunk]);
      let newline: number;
      while ((newline = pending.indexOf(10)) >= 0) {
        if (newline > MAX_LINE || !parser.accept(pending.subarray(0, newline))) return stop();
        pending = pending.subarray(newline + 1);
      }
      if (pending.length > MAX_LINE) stop();
    });
    child.on('close', (code) => {
      clearTimeout(deadline);
      clearTimeout(killTimer);
      resolve(!failed && code === 0 && pending.length === 0 && parser.done ? parser.objects : undefined);
    });
    const request = Buffer.alloc(12 + prefixes.length * 2);
    request.write(headers ? 'BWD1' : 'BWR1');
    request.writeUInt32BE(1, 4);
    request.writeUInt32BE(prefixes.length, 8);
    request.write(prefixes.join(''), 12);
    child.stdin.end(request);
  });
}
