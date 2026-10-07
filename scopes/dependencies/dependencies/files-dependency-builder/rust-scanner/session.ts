import { spawn } from 'child_process';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import { createHash } from 'crypto';
import { decodeResponse } from './protocol';
import type { RustDependencyScannerSessionOptions, RustScannerOutcome } from './types';

export type { RustDependencyScannerSessionOptions, RustScannerOutcome } from './types';

type Pending = {
  id: string;
  paths: string[];
  timer: ReturnType<typeof setTimeout>;
  resolve: (files: RustScannerOutcome[] | undefined) => void;
};

type Limits = {
  batchFiles: number;
  requestBytes: number;
  responseBytes: number;
  cacheBytes: number;
  queuedBytes: number;
  pendingRequests: number;
  timeoutMs: number;
};

function limit(value: number | undefined, fallback: number, maximum: number, name: string): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum) throw new Error(`invalid Rust scanner ${name}`);
  return result;
}

/** One dependency-analysis operation owns one helper, its bounded cache, and all outstanding work. */
export class RustDependencyScannerSession {
  private readonly options: RustDependencyScannerSessionOptions;
  private readonly cwd: string;
  private readonly limits: Limits;
  private child?: ChildProcessWithoutNullStreams;
  private pending?: Pending;
  private output = Buffer.alloc(0);
  private stderr = Buffer.alloc(0);
  private readonly cache = new Map<string, RustScannerOutcome>();
  private cacheBytes = 0;
  private sequence = 0;
  private queuedBytes = 0;
  private queuedRequests = 0;
  private killTimer?: ReturnType<typeof setTimeout>;
  private queue: Promise<void> = Promise.resolve();
  private failure?: string;
  private readonly abort = () => this.fail('Rust scanner operation cancelled');

  constructor(options: RustDependencyScannerSessionOptions) {
    if (!options.executable || typeof options.executable !== 'string')
      throw new Error('Rust scanner executable is required');
    if (options.threads !== undefined) limit(options.threads, 8, 64, 'threads');
    if (
      options.args !== undefined &&
      (!Array.isArray(options.args) || Array.from(options.args).some((arg) => typeof arg !== 'string'))
    ) {
      throw new Error('Rust scanner args must be an array of strings');
    }
    this.options = { ...options, args: options.args ? [...options.args] : undefined };
    this.cwd = path.resolve(options.cwd ?? process.cwd());
    this.limits = {
      batchFiles: limit(options.maxBatchFiles, 256, 4096, 'batch size'),
      requestBytes: limit(options.maxRequestBytes, 1024 * 1024, 8 * 1024 * 1024, 'request bytes'),
      responseBytes: limit(options.maxResponseBytes, 8 * 1024 * 1024, 64 * 1024 * 1024, 'response bytes'),
      cacheBytes: limit(options.maxCacheBytes, 32 * 1024 * 1024, 256 * 1024 * 1024, 'cache bytes'),
      queuedBytes: limit(options.maxQueuedBytes, 8 * 1024 * 1024, 64 * 1024 * 1024, 'queued bytes'),
      pendingRequests: limit(options.maxPendingRequests, 64, 4096, 'pending requests'),
      timeoutMs: limit(options.timeoutMs, 30_000, 300_000, 'timeout'),
    };
    options.signal?.addEventListener('abort', this.abort, { once: true });
    if (options.signal?.aborted) this.abort();
  }

  get unavailableReason(): string | undefined {
    return this.failure;
  }

  prefetch(paths: readonly string[]): Promise<void> {
    // Do not retain an arbitrarily large caller array while a previous operation is pending.
    if (paths.length > 100_000) {
      return Promise.resolve();
    }
    const bytes = paths.reduce((sum, file) => sum + Buffer.byteLength(path.resolve(this.cwd, file)) + 32, 0);
    if (!this.reserveQueue(bytes)) return Promise.resolve();
    const logicalPaths = [...paths];
    this.queue = this.queue
      .then(() => this.prefetchQueued(logicalPaths))
      .catch((error) => this.fail(String(error)))
      .finally(() => {
        this.queuedBytes -= bytes;
        this.queuedRequests -= 1;
      });
    return this.queue;
  }

  async scanSource(logicalPath: string, source: string): Promise<RustScannerOutcome | undefined> {
    if (this.failure || Buffer.byteLength(source) > 1024 * 1024) return undefined;
    const identity = path.resolve(this.cwd, logicalPath);
    const key = `source:${identity}\0${createHash('sha256').update(source).digest('hex')}`;
    const bytes = Buffer.byteLength(source) + Buffer.byteLength(identity) + 128;
    if (!this.reserveQueue(bytes)) return undefined;
    let result: RustScannerOutcome | undefined;
    this.queue = this.queue
      .then(async () => {
        if (this.failure) return;
        const cached = this.cache.get(key);
        if (cached) {
          result = cached;
          return;
        }
        const files = await this.request([identity], source);
        if (!files || this.failure || !this.store(files, [key])) return;
        [result] = files;
      })
      .catch((error) => this.fail(String(error)))
      .finally(() => {
        this.queuedBytes -= bytes;
        this.queuedRequests -= 1;
      });
    await this.queue;
    return !this.failure && result ? { ...JSON.parse(JSON.stringify(result)), path: logicalPath } : undefined;
  }

  private reserveQueue(bytes: number): boolean {
    if (this.failure) return false;
    if (this.queuedBytes + bytes > this.limits.queuedBytes || this.queuedRequests >= this.limits.pendingRequests)
      return false;
    this.queuedBytes += bytes;
    this.queuedRequests += 1;
    return true;
  }

  get(logicalPath: string): RustScannerOutcome | undefined {
    if (this.failure) return undefined;
    const file = this.cache.get(path.resolve(this.cwd, logicalPath));
    // Return a copy so callers cannot mutate the cached outcome or dependency metadata.
    return file ? { ...JSON.parse(JSON.stringify(file)), path: logicalPath } : undefined;
  }

  dispose(): void {
    this.fail('Rust scanner session disposed');
  }

  private fail(reason: string): void {
    if (this.failure) return;
    this.failure = reason;
    this.options.signal?.removeEventListener('abort', this.abort);
    this.cache.clear();
    this.cacheBytes = 0;
    this.output = Buffer.alloc(0);
    this.stderr = Buffer.alloc(0);
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.resolve(undefined);
      this.pending = undefined;
    }
    this.child?.stdin.destroy();
    this.child?.stdout.destroy();
    this.child?.stderr.destroy();
    if (this.child && this.child.exitCode === null && this.child.signalCode === null) {
      this.child.kill();
      this.killTimer = setTimeout(() => this.child?.kill('SIGKILL'), 1000);
      this.killTimer.unref();
    }
  }

  private start(): void {
    if (this.child || this.failure) return;
    const args = [...(this.options.args || [])];
    if (this.options.threads !== undefined) args.push('--threads', String(this.options.threads));
    this.child = spawn(this.options.executable, args, { cwd: this.cwd, stdio: 'pipe', shell: false });
    this.child.on('error', (error) => this.fail(`Rust scanner spawn error: ${error.message}`));
    this.child.on('exit', () => {
      if (this.killTimer) clearTimeout(this.killTimer);
      this.fail('Rust scanner process exited');
    });
    this.child.stdin.on('error', (error) => this.fail(`Rust scanner input error: ${error.message}`));
    this.child.stdout.on('error', (error) => this.fail(`Rust scanner output error: ${error.message}`));
    this.child.stdout.on('end', () => this.fail('Rust scanner output ended'));
    this.child.stdout.on('data', (chunk: Buffer) => this.receive(chunk));
    this.child.stderr.on('error', (error) => this.fail(`Rust scanner diagnostics error: ${error.message}`));
    this.child.stderr.on('data', (chunk: Buffer) => {
      if (this.failure) return;
      // Keep a bounded diagnostic tail even when the child emits continuously.
      this.stderr = Buffer.concat([this.stderr, chunk.subarray(-16_384)]).subarray(-16_384);
    });
    this.keepAlive(false);
  }

  /**
   * An idle helper must not keep the Node process alive when a caller never disposes the session;
   * on exit the helper sees stdin EOF and stops. Only an in-flight request holds the event loop.
   */
  private keepAlive(active: boolean): void {
    const child = this.child;
    if (!child) return;
    for (const handle of [child, child.stdin, child.stdout, child.stderr] as Array<{ ref(): void; unref(): void }>) {
      if (active) handle.ref();
      else handle.unref();
    }
  }

  private receive(chunk: Buffer): void {
    if (this.failure) return;
    if (!this.pending || this.output.length + chunk.length > this.limits.responseBytes) {
      this.fail('Rust scanner unsolicited or oversized output');
      return;
    }
    this.output = Buffer.concat([this.output, chunk]);
    const newline = this.output.indexOf(10);
    if (newline < 0) return;
    if (newline !== this.output.length - 1) {
      this.fail('Rust scanner emitted extra output');
      return;
    }
    const pending = this.pending;
    try {
      const line = this.output.subarray(0, newline);
      if (!Buffer.from(line.toString('utf8')).equals(line)) throw new Error('response is not UTF-8');
      const files = decodeResponse(this.output.subarray(0, newline).toString('utf8'), pending.id, pending.paths);
      this.output = Buffer.alloc(0);
      this.pending = undefined;
      clearTimeout(pending.timer);
      this.keepAlive(false);
      pending.resolve(files);
    } catch (error) {
      this.fail(`Rust scanner protocol error: ${String(error)}`);
    }
  }

  private async request(paths: string[], source?: string): Promise<RustScannerOutcome[] | undefined> {
    if (this.failure) return undefined;
    const id = String(++this.sequence);
    const input = JSON.stringify({
      version: 1,
      id,
      files: paths.map((file) => (source === undefined ? { path: file } : { path: file, source })),
      options: {},
    });
    if (Buffer.byteLength(input) > this.limits.requestBytes) {
      if (source === undefined) this.fail('Rust scanner request byte limit exceeded');
      return undefined;
    }
    this.start();
    if (this.failure || !this.child) return undefined;
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.fail('Rust scanner response timed out'), this.limits.timeoutMs);
      this.pending = { id, paths, timer, resolve };
      this.keepAlive(true);
      this.child!.stdin.write(`${input}\n`, (error) => {
        if (error) this.fail(`Rust scanner write failed: ${error.message}`);
      });
    });
  }

  private async prefetchQueued(paths: readonly string[]): Promise<void> {
    if (this.failure) return;
    const seen = new Set<string>();
    let batch: string[] = [];
    let bytes = 128;
    for (const logicalPath of paths) {
      const file = path.resolve(this.cwd, logicalPath);
      if (seen.has(file) || this.cache.has(file)) continue;
      seen.add(file);
      const size = Buffer.byteLength(JSON.stringify({ path: file })) + 1;
      if (batch.length && (batch.length === this.limits.batchFiles || bytes + size > this.limits.requestBytes)) {
        await this.storeBatch(batch);
        if (this.failure) return;
        batch = [];
        bytes = 128;
      }
      batch.push(file);
      bytes += size;
    }
    if (batch.length) await this.storeBatch(batch);
  }

  private async storeBatch(paths: string[]): Promise<void> {
    const files = await this.request(paths);
    if (!files || this.failure) return;
    this.store(
      files,
      files.map((file) => file.path)
    );
  }

  private store(files: RustScannerOutcome[], keys: string[]): boolean {
    const bytes = Buffer.byteLength(JSON.stringify(files)) + keys.reduce((sum, key) => sum + Buffer.byteLength(key), 0);
    if (this.cacheBytes + bytes > this.limits.cacheBytes) {
      this.fail('Rust scanner session cache byte limit exceeded');
      return false;
    }
    files.forEach((file, index) => this.cache.set(keys[index], file));
    this.cacheBytes += bytes;
    return true;
  }
}
