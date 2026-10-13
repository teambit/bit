import { spawnRustImportTransport, type RustImportTransport } from './rust-import-transport';
import path from 'path';

export type SourceValidation = { inflatedBytes: number };
type Request = {
  hash: string;
  buffer: Buffer;
  resolve: (value?: SourceValidation) => void;
};
type Batch = { id: number; items: Request[]; timer: ReturnType<typeof setTimeout> };
const MAX_BATCH_BYTES = 128 * 1024 * 1024;
const MAX_OUTSTANDING_BYTES = 256 * 1024 * 1024;
const MAX_PENDING = 64;
const MAX_BATCH = 16;
const MAX_RESPONSE_BYTES = 16 * 1024;

/** Binary compressed objects stay in Node; native workers return only verified Source identities/sizes. */
export class RustSourceValidator {
  readonly stats = { submitted: 0, sources: 0, legacy: 0, batches: 0 };
  unavailableReason?: string;
  private child?: RustImportTransport;
  private stopped: Promise<void> = Promise.resolve();
  private queued: Request[] = [];
  private active?: Batch;
  private bytes = 0;
  private output = Buffer.alloc(0);
  private scheduled = false;
  private id = 0;

  constructor(
    private executable: string,
    private timeoutMs = 120000,
    private args: string[] = []
  ) {}

  validate(hash: string, buffer: Buffer): Promise<SourceValidation | undefined> {
    if (
      this.unavailableReason ||
      !/^[a-f0-9]{40}$/.test(hash) ||
      buffer.length === 0 ||
      buffer.length > MAX_BATCH_BYTES ||
      this.bytes + buffer.length > MAX_OUTSTANDING_BYTES ||
      this.queued.length + (this.active?.items.length || 0) >= MAX_PENDING
    ) {
      return Promise.resolve(undefined);
    }
    return new Promise((resolve) => {
      this.bytes += buffer.length;
      this.queued.push({ hash, buffer, resolve });
      this.schedule();
    });
  }

  dispose() {
    this.fail('object validator disposed');
  }

  async disposeAndWait() {
    this.dispose();
    await this.stopped;
  }

  private schedule() {
    if (this.scheduled || this.active || this.unavailableReason) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (this.active || this.unavailableReason || !this.queued.length) return;
      if (this.id >= 0xffffffff) return this.fail('request ID exhausted');
      let bytes = 0;
      const items: Request[] = [];
      while (items.length < MAX_BATCH && this.queued.length) {
        const next = this.queued[0];
        if (bytes + next.buffer.length > MAX_BATCH_BYTES) break;
        bytes += next.buffer.length;
        items.push(this.queued.shift() as Request);
      }
      this.id += 1;
      const timer = setTimeout(() => this.fail('object validation timed out'), this.timeoutMs);
      this.active = { id: this.id, items, timer };
      this.stats.batches += 1;
      this.stats.submitted += items.length;
      this.send(this.active).catch((error) => this.fail(String(error)));
    });
  }

  private start(): RustImportTransport {
    if (this.child) return this.child;
    const child = spawnRustImportTransport(this.executable, this.args);
    this.child = child;
    this.stopped = new Promise((resolve) => {
      child.once('exit', resolve);
      child.once('error', resolve);
    });
    child.on('error', (error) => this.fail(`spawn error: ${error.message}`));
    child.on('exit', () => this.fail('object validator exited'));
    child.stdin.on('error', (error) => this.fail(`input error: ${error.message}`));
    child.stdout.on('error', (error) => this.fail(`output error: ${error.message}`));
    child.stdout.on('end', () => this.fail('object validator output ended'));
    child.stdout.on('data', (data: Buffer) => this.receive(data));
    // Drain stderr without retaining object diagnostics or unbounded subprocess output.
    child.stderr.on('data', () => undefined);
    child.stderr.on('error', (error) => this.fail(`diagnostics error: ${error.message}`));
    return child;
  }

  private write(buffer: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      this.start().stdin.write(buffer, (error) => (error ? reject(error) : resolve()));
    });
  }

  private async send(batch: Batch) {
    const header = Buffer.alloc(12);
    header.write('BOI1');
    header.writeUInt32BE(batch.id, 4);
    header.writeUInt32BE(batch.items.length, 8);
    await this.write(header);
    for (const item of batch.items) {
      if (this.unavailableReason) return;
      const record = Buffer.alloc(24);
      Buffer.from(item.hash, 'hex').copy(record);
      record.writeUInt32BE(item.buffer.length, 20);
      await this.write(record);
      // The original compressed buffer is written with stream backpressure, without base64/JSON copies.
      await this.write(item.buffer);
    }
  }

  private receive(chunk: Buffer) {
    if (!this.active || this.output.length + chunk.length > MAX_RESPONSE_BYTES) {
      return this.fail('unsolicited or oversized response');
    }
    this.output = Buffer.concat([this.output, chunk] as unknown as Uint8Array[]);
    const newline = this.output.indexOf(10);
    if (newline < 0) return;
    if (newline !== this.output.length - 1) return this.fail('extra response bytes');
    try {
      const response = JSON.parse(this.output.toString('utf8'));
      const batch = this.active;
      if (response.version !== 1 || response.id !== batch.id || !Array.isArray(response.files)) {
        throw new Error('invalid response identity');
      }
      if (response.files.length !== batch.items.length) throw new Error('invalid response length');
      // Validate the complete batch before resolving any success that could be persisted.
      const values: (SourceValidation | undefined)[] = response.files.map(
        (file: Record<string, unknown>, index: number) => {
          if (file.hash !== batch.items[index].hash) throw new Error('invalid file identity');
          if (file.status === 'legacy' && file.inflatedBytes === 0 && typeof file.reason === 'string') return undefined;
          if (
            file.status !== 'source' ||
            file.reason !== null ||
            typeof file.inflatedBytes !== 'number' ||
            !Number.isSafeInteger(file.inflatedBytes) ||
            file.inflatedBytes < 1 ||
            file.inflatedBytes > 1024 * 1024 * 1024
          ) {
            throw new Error('invalid source validation');
          }
          return { inflatedBytes: file.inflatedBytes };
        }
      );
      clearTimeout(batch.timer);
      this.output = Buffer.alloc(0);
      this.active = undefined;
      batch.items.forEach((item, index) => {
        this.bytes -= item.buffer.length;
        if (values[index]) this.stats.sources += 1;
        else this.stats.legacy += 1;
        item.resolve(values[index]);
      });
      this.schedule();
    } catch (error) {
      this.fail(`protocol error: ${String(error)}`);
    }
  }

  private fail(reason: string) {
    if (this.unavailableReason) return;
    this.unavailableReason = reason;
    if (this.active) clearTimeout(this.active.timer);
    for (const item of [...(this.active?.items || []), ...this.queued]) item.resolve(undefined);
    this.active = undefined;
    this.queued = [];
    this.bytes = 0;
    this.output = Buffer.alloc(0);
    const child = this.child;
    if (!child) return;
    child.stdin.destroy();
    child.kill('SIGTERM');
    const escalation = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, 250);
    escalation.unref();
    child.once('exit', () => clearTimeout(escalation));
  }
}

export function createRustSourceValidator(value = process.env.BIT_RUST_OBJECT_IMPORT): RustSourceValidator | undefined {
  if (!value || !path.isAbsolute(value)) return undefined;
  return new RustSourceValidator(process.platform === 'win32' ? path.toNamespacedPath(value) : value);
}
