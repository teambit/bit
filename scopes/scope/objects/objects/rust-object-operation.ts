import { spawn } from 'child_process';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import { resolveRustWorkspaceAddon } from './rust-object-discovery';
import { availableParallelism } from 'os';

type RecordRequest = { json: string; parse: (value: any) => unknown };
type Group = { records: RecordRequest[]; bytes: number; operation: Promise<unknown[] | undefined> };
type NativePlan<T> = { apply<R>(run: (value: T) => R): R | undefined };
type ObjectEngine = { request: (input: Buffer) => Promise<Buffer>; close: () => void };
const MAX_BYTES = 8 * 1024 * 1024;

/** A single bounded import session. Plans contain current canonical values, never cached native objects. */
export class NativeImportOperation {
  readonly stats = { frames: 0, operations: 0, persisted: 0, indexes: 0, stalePlans: 0, missingHits: 0 };
  unavailableReason?: string;
  private missing = new Set<string>();
  private generation = 0;
  private child?: ChildProcessWithoutNullStreams;
  private engine?: ObjectEngine;
  private stopped: Promise<void> = Promise.resolve();
  private tail: Promise<unknown> = Promise.resolve();
  private group?: Group;
  private count = 0;
  private bytes = 0;
  private id = 0;
  private output: Buffer[] = [];
  private outputBytes = 0;
  private pending?: {
    resolve: (value?: unknown[]) => void;
    records: RecordRequest[];
    id: number;
    timer: ReturnType<typeof setTimeout>;
  };
  constructor(
    private executable: string,
    private options: { objectsDirectory: string; owner?: { uid: number; gid: number } | null },
    private timeoutMs = 120000,
    private args: string[] = []
  ) {}

  get objectsDirectory() {
    return this.options.objectsDirectory;
  }

  async request<T>(operation: object, parse: (value: any) => T): Promise<T | undefined> {
    if (this.unavailableReason || this.count >= 64) return undefined;
    let json: string;
    try {
      json = JSON.stringify(operation);
    } catch {
      return undefined;
    }
    if (typeof json !== 'string') return undefined;
    const bytes = Buffer.byteLength(json);
    if (bytes + 2 > MAX_BYTES || this.bytes + bytes > 32 * 1024 * 1024) return undefined;
    this.count++;
    this.bytes += bytes;
    let group = this.group;
    if (!group || group.records.length >= 64 || group.bytes + bytes + 1 > MAX_BYTES - 2) {
      const next: Group = {
        records: [],
        bytes: 0,
        operation: this.tail.then(() => {
          if (this.group === next) this.group = undefined;
          return this.execute(next.records);
        }),
      };
      this.tail = next.operation.catch(() => this.stop('native operation failed'));
      this.group = group = next;
    }
    const offset = group.records.length;
    group.records.push({ json, parse });
    group.bytes += bytes + 1;
    try {
      return (await group.operation)?.[offset] as T | undefined;
    } finally {
      this.count--;
      this.bytes -= bytes;
    }
  }

  /** Check and apply synchronously: another remote cannot interleave between these steps. */
  async plan<T>(project: () => object, parse: (value: any) => T): Promise<NativePlan<T> | undefined> {
    if (this.unavailableReason || this.count >= 64) return undefined;
    let operation: object;
    let snapshot: string;
    try {
      operation = project();
      snapshot = JSON.stringify(operation);
    } catch {
      return undefined;
    }
    const result = await this.request(operation, parse);
    if (result === undefined) return undefined;
    return {
      apply: <R>(run: (value: T) => R): R | undefined => {
        try {
          if (JSON.stringify(project()) !== snapshot) {
            this.stats.stalePlans++;
            return undefined;
          }
        } catch {
          this.stats.stalePlans++;
          return undefined;
        }
        return run(result);
      },
    };
  }

  get writeGeneration() {
    return this.generation;
  }
  rememberMissing(hash: string, generation: number) {
    if (generation !== this.generation || !/^[a-f0-9]{40}$/.test(hash)) return;
    this.missing.delete(hash);
    this.missing.add(hash);
    if (this.missing.size > 1024) this.missing.delete(this.missing.values().next().value!);
  }
  invalidateMissing(hash?: string) {
    this.generation++;
    if (hash === undefined) this.missing.clear();
    else this.missing.delete(hash);
  }
  async revalidateMissing(hash: string): Promise<boolean | undefined> {
    if (!this.missing.has(hash)) return undefined;
    const generation = this.generation;
    const found = await this.request({ kind: 'missing', hash }, (value) =>
      typeof value === 'boolean' ? value : undefined
    );
    if (found !== false || generation !== this.generation) {
      this.missing.delete(hash);
      return undefined;
    }
    this.stats.missingHits++;
    return false;
  }

  async disposeAndWait() {
    this.invalidateMissing();
    this.stop('native operation disposed');
    await this.stopped;
  }

  async appendArchive(offset: number, buffer: Buffer, maxBytes: number): Promise<number | undefined> {
    if (
      this.unavailableReason ||
      this.count >= 64 ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(maxBytes) ||
      maxBytes < 0 ||
      maxBytes > 2 * 1024 * 1024 * 1024 ||
      !buffer.length ||
      buffer.length > 1024 * 1024 ||
      offset + buffer.length > maxBytes ||
      this.bytes + buffer.length > 32 * 1024 * 1024
    )
      return undefined;
    this.group = undefined;
    this.count++;
    this.bytes += buffer.length;
    const operation = this.tail.then(() =>
      this.execute(
        [
          {
            json: '{}',
            parse: (value) => {
              if (value !== offset + buffer.length) throw new Error('invalid native spool acknowledgement');
              return value;
            },
          },
        ],
        { offset, buffer, maxBytes }
      )
    );
    this.tail = operation.catch(() => this.stop('native spool failed'));
    try {
      return (await operation)?.[0] as number | undefined;
    } finally {
      this.count--;
      this.bytes -= buffer.length;
    }
  }

  private async execute(
    records: RecordRequest[],
    raw?: { offset: number; buffer: Buffer; maxBytes: number }
  ): Promise<unknown[] | undefined> {
    if (this.unavailableReason) return undefined;
    const id = ++this.id;
    if (id > 0xffffffff) {
      this.stop('operation identity exhausted');
      return undefined;
    }
    const body = raw?.buffer || Buffer.from(`[${records.map((record) => record.json).join(',')}]`);
    const frame = Buffer.alloc(raw ? 20 : 12);
    frame.write(raw ? 'BSP1' : 'BOP1');
    frame.writeUInt32BE(id, 4);
    if (raw) {
      frame.writeUInt32BE(raw.offset, 8);
      frame.writeUInt32BE(body.length, 12);
      frame.writeUInt32BE(raw.maxBytes, 16);
    } else frame.writeUInt32BE(body.length, 8);
    const result = await new Promise<unknown[] | undefined>((resolve) => {
      this.pending = {
        resolve,
        records,
        id,
        timer: setTimeout(() => this.stop('native operation timed out'), this.timeoutMs),
      };
      try {
        if (this.startEngine()) {
          const input = Buffer.concat([frame, body]);
          this.stopped = Promise.resolve().then(() => this.executeNative(input));
          return;
        }
        const child = this.start();
        child.stdin.cork();
        child.stdin.write(frame);
        child.stdin.write(body);
        child.stdin.uncork();
      } catch {
        this.stop('native operation input failed');
      }
    });
    if (!result) await this.stopped;
    this.stats.frames++;
    this.stats.operations += records.length;
    return result;
  }

  private startEngine(): boolean {
    if (this.engine) return true;
    if (this.child || this.args.length) return false;
    const addon = resolveRustWorkspaceAddon(this.executable);
    if (!addon) return false;
    try {
      const { WorkspaceEngine } = require(addon) as {
        WorkspaceEngine: {
          forObjects: (threads: number, directory: string, uid?: number, gid?: number) => ObjectEngine;
        };
      };
      this.engine = WorkspaceEngine.forObjects(
        Math.min(4, availableParallelism()),
        this.options.objectsDirectory,
        this.options.owner?.uid,
        this.options.owner?.gid
      );
      return true;
    } catch {
      return false;
    }
  }

  private async executeNative(input: Buffer): Promise<void> {
    try {
      const response = await this.engine!.request(input);
      if (!this.unavailableReason) this.receive(response);
    } catch {
      this.stop('native operation request failed');
    } finally {
      if (this.unavailableReason) this.engine!.close();
    }
  }

  private start() {
    if (this.child) return this.child;
    const args = [...this.args, '--objects-dir', this.options.objectsDirectory];
    if (this.options.owner) args.push('--owner', `${this.options.owner.uid}:${this.options.owner.gid}`);
    const child = spawn(this.executable, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.child = child;
    this.stopped = new Promise((resolve) => {
      child.once('exit', resolve);
      child.once('error', resolve);
    });
    child.on('error', () => this.stop('native operation spawn failed'));
    child.on('exit', () => this.stop('native operation exited'));
    for (const stream of [child.stdin, child.stdout, child.stderr])
      stream.on('error', () => this.stop('native operation stream failed'));
    child.stderr.on('data', () => undefined);
    child.stdout.on('end', () => this.stop('native operation output ended'));
    child.stdout.on('data', (chunk: Buffer) => this.receive(chunk));
    return child;
  }

  private receive(chunk: Buffer) {
    if (!this.pending || this.outputBytes + chunk.length > 32 * 1024 * 1024)
      return this.stop('invalid native operation output');
    this.output.push(chunk);
    this.outputBytes += chunk.length;
    const newline = chunk.indexOf(10);
    if (newline < 0) return;
    if (newline !== chunk.length - 1) return this.stop('extra native operation output');
    try {
      const response = JSON.parse(Buffer.concat(this.output as unknown as Uint8Array[]).toString());
      if (
        response.version !== 1 ||
        response.id !== this.pending.id ||
        !Array.isArray(response.results) ||
        response.results.length !== this.pending.records.length
      )
        throw new Error('invalid native operation coverage');
      const values = response.results.map((value: unknown, index: number) => this.pending!.records[index].parse(value));
      const pending = this.pending;
      this.pending = undefined;
      this.output = [];
      this.outputBytes = 0;
      clearTimeout(pending.timer);
      pending.resolve(values);
    } catch {
      this.stop('invalid native operation response');
    }
  }

  private stop(reason: string) {
    if (this.unavailableReason) return;
    this.unavailableReason = reason;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.resolve(undefined);
      this.pending = undefined;
    }
    this.output = [];
    this.outputBytes = 0;
    if (this.engine) this.engine.close();
    const child = this.child;
    if (!child) return;
    child.stdin.destroy();
    if (!child.pid || child.pid <= 0) return;
    child.kill('SIGTERM');
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, 250);
    timer.unref();
    child.once('exit', () => clearTimeout(timer));
  }
}

export function nativeIndices(value: unknown, count: number): number[] {
  if (
    !Array.isArray(value) ||
    value.some((index) => !Number.isInteger(index) || index < 0 || index >= count) ||
    new Set(value).size !== value.length
  )
    throw new Error('invalid native indices');
  return value;
}

export function nativeSelections(value: unknown, counts: number[]): [number, number][] {
  if (
    !Array.isArray(value) ||
    value.some(
      (entry) =>
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        !Number.isInteger(entry[0]) ||
        !Number.isInteger(entry[1]) ||
        entry[0] < 0 ||
        entry[0] >= counts.length ||
        entry[1] < 0 ||
        entry[1] >= counts[entry[0]]
    ) ||
    new Set(value.map((entry) => `${entry[0]}:${entry[1]}`)).size !== value.length
  )
    throw new Error('invalid native selections');
  return value;
}
