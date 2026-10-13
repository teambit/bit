import { spawnRustImportTransport, type RustImportTransport } from './rust-import-transport';
import type { SourceValidation } from './rust-source-validator';

export type NativeSourceStoreOptions = { objectsDirectory: string; owner?: { uid: number; gid: number } | null };
export type MetadataValidation = { inflatedBytes: number; metadata: string };
type ObjectValidation = SourceValidation | MetadataValidation;
export type NativeObjectInput = { ref: { toString(): string }; buffer: Buffer };
type MutableGroup = {
  objects: NativeObjectInput[];
  hashes: Set<string>;
  operation: Promise<(number | null)[] | undefined>;
};
type Pending = {
  parse: (response: any) => unknown;
  resolve: (value?: any) => void;
  timer: ReturnType<typeof setTimeout>;
};
const MAX_BYTES = 128 * 1024 * 1024;
const MAX_OUTSTANDING = 256 * 1024 * 1024;
const MAX_MUTABLE_BYTES = 512 * 1024;

/** One validation and one commit response per batch; Source bytes never return to JavaScript. */
export class RustObjectImporter {
  readonly stats = {
    submitted: 0,
    sources: 0,
    legacy: 0,
    batches: 0,
    metadata: 0,
    persisted: 0,
    writeFallbacks: 0,
    mutableBatches: 0,
    mutableSubmitted: 0,
    mutablePersisted: 0,
    mutableFallbacks: 0,
  };
  unavailableReason?: string;
  private child?: RustImportTransport;
  private pending?: Pending;
  private output: Buffer[] = [];
  private outputBytes = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private bytes = 0;
  private count = 0;
  private mutableGroup?: MutableGroup;
  private id = 0;
  private stopped: Promise<void> = Promise.resolve();
  constructor(
    private executable: string,
    private options: NativeSourceStoreOptions,
    private timeoutMs = 120000,
    private args: string[] = []
  ) {}

  /** Use a separate operation session: a validation session may be awaiting its Source commit. */
  async persistMetadata(objects: NativeObjectInput[]): Promise<(number | null)[] | undefined> {
    if (!objects.length || objects.length > 16 || this.count + objects.length > 64 || this.unavailableReason)
      return undefined;
    const identities = objects.map((object) => object.ref.toString());
    const hashes = new Set(identities);
    if (
      hashes.size !== objects.length ||
      objects.some(
        (object, index) =>
          !/^[a-f0-9]{40}$/.test(identities[index]) || !object.buffer.length || object.buffer.length > MAX_MUTABLE_BYTES
      )
    )
      return undefined;
    this.count += objects.length;
    const pending = this.mutableGroup;
    let group: MutableGroup;
    let offset = 0;
    if (
      !pending ||
      pending.objects.length + objects.length > 16 ||
      identities.some((hash) => pending.hashes.has(hash))
    ) {
      const next: MutableGroup = {
        objects,
        hashes,
        operation: this.tail.then(() => {
          if (this.mutableGroup === next) this.mutableGroup = undefined;
          return this.persistMutableBatch(next.objects);
        }),
      };
      this.tail = next.operation.then(
        () => undefined,
        () => this.fail('mutable batch processing failed')
      );
      this.mutableGroup = next;
      group = next;
    } else {
      group = pending;
      offset = group.objects.length;
      // Never mutate a caller's input array when a later request joins its queued frame.
      group.objects = group.objects.concat(objects);
      for (const hash of identities) group.hashes.add(hash);
    }
    try {
      const result = await group.operation;
      return offset === 0 && group.objects.length === objects.length
        ? result
        : result?.slice(offset, offset + objects.length);
    } finally {
      this.count -= objects.length;
    }
  }

  /** One remote's accepted metadata prefix must stop at its first filesystem failure. */
  async persistMetadataSequential(objects: NativeObjectInput[]): Promise<(number | null)[] | undefined> {
    if (
      !objects.length ||
      objects.length > 16 ||
      this.count + objects.length > 64 ||
      this.unavailableReason ||
      new Set(objects.map((object) => object.ref.toString())).size !== objects.length ||
      objects.some(
        (object) =>
          !/^[a-f0-9]{40}$/.test(object.ref.toString()) ||
          !object.buffer.length ||
          object.buffer.length > MAX_MUTABLE_BYTES
      )
    )
      return undefined;
    this.mutableGroup = undefined;
    this.count += objects.length;
    const operation = this.tail.then(() => this.persistMutableBatch(objects, true));
    this.tail = operation.then(
      () => undefined,
      () => this.fail('ordered mutable processing failed')
    );
    try {
      return await operation;
    } finally {
      this.count -= objects.length;
    }
  }

  /** Coalesce only requests already queued; callers still await their own persisted slice. */
  private async persistMutableBatch(
    objects: NativeObjectInput[],
    sequential = false
  ): Promise<(number | null)[] | undefined> {
    this.stats.mutableBatches += 1;
    const id = ++this.id;
    if (id > 0xffffffff) this.fail('request ID exhausted');
    const header = Buffer.alloc(12);
    header.write(sequential ? 'BMS1' : 'BMP1');
    header.writeUInt32BE(id, 4);
    header.writeUInt32BE(objects.length, 8);
    const vectors: Buffer[] = [header];
    for (const object of objects) {
      const entry = Buffer.alloc(24);
      Buffer.from(object.ref.toString(), 'hex').copy(entry);
      entry.writeUInt32BE(object.buffer.length, 20);
      vectors.push(entry, object.buffer);
    }
    const result = await this.request(vectors, (response) => {
      if (
        response.version !== 1 ||
        response.id !== id ||
        !Array.isArray(response.sizes) ||
        response.sizes.length !== objects.length ||
        response.sizes.some(
          (size: unknown) =>
            size !== null &&
            (!Number.isSafeInteger(size) || Number(size) <= 0 || Number(size) > MAX_MUTABLE_BYTES + 1024)
        )
      )
        throw new Error('invalid mutable write response');
      if (sequential) {
        const failed = response.sizes.indexOf(null);
        if (failed >= 0 && response.sizes.slice(failed).some((size: unknown) => size !== null))
          throw new Error('invalid ordered mutable prefix');
      }
      return response.sizes as (number | null)[];
    });
    // Never race a timed-out native rename with a canonical mutable-object retry.
    if (!result) await this.stopped;
    this.stats.mutableSubmitted += objects.length;
    const persisted = (result as (number | null)[] | undefined)?.filter((size) => size !== null).length || 0;
    this.stats.mutablePersisted += persisted;
    this.stats.mutableFallbacks += objects.length - persisted;
    return result as (number | null)[] | undefined;
  }

  async importBatch(
    objects: NativeObjectInput[],
    select: (values: (ObjectValidation | undefined)[]) => Promise<number[]>,
    finish: (selected: number[], persisted?: Set<number>) => Promise<void>
  ): Promise<void> {
    // Validation/select/commit is an ordering barrier between mutable request groups.
    this.mutableGroup = undefined;
    const bytes = objects.reduce((total, object) => total + object.buffer.length, 0);
    const eligible =
      objects.length > 0 &&
      objects.length <= 16 &&
      bytes <= MAX_BYTES &&
      this.bytes + bytes <= MAX_OUTSTANDING &&
      this.count + objects.length <= 64 &&
      objects.every((object) => /^[a-f0-9]{40}$/.test(object.ref.toString()) && object.buffer.length > 0);
    if (!eligible || this.unavailableReason) {
      const selected = await select(objects.map(() => undefined));
      await finish(selected);
      return;
    }
    this.bytes += bytes;
    this.count += objects.length;
    const operation = this.tail.then(async () => {
      const version = process.env.BIT_RUST_OBJECT_IMPORT_METADATA === 'off' ? 2 : 3;
      const id = ++this.id;
      if (id > 0xffffffff) this.fail('request ID exhausted');
      const header = Buffer.alloc(12);
      header.write(`BOI${version}`);
      header.writeUInt32BE(Math.min(id, 0xffffffff), 4);
      header.writeUInt32BE(objects.length, 8);
      const vectors: Buffer[] = [header];
      for (const object of objects) {
        const record = Buffer.alloc(24);
        Buffer.from(object.ref.toString(), 'hex').copy(record);
        record.writeUInt32BE(object.buffer.length, 20);
        vectors.push(record, object.buffer);
      }
      const values = (await this.request(vectors, (response) => {
        if (
          response.version !== version ||
          response.id !== id ||
          !Array.isArray(response.files) ||
          response.files.length !== objects.length
        )
          throw new Error('invalid validation identity');
        return response.files.map((file: any, index: number): ObjectValidation | undefined => {
          if (file.hash !== objects[index].ref.toString()) throw new Error('invalid Source identity');
          if (
            version === 3 &&
            file.status === 'metadata' &&
            file.reason === null &&
            typeof file.metadata === 'string'
          ) {
            const end = file.metadata.indexOf('\0');
            if (end < 0 || end >= 256 || file.metadata.slice(0, end).split(' ')[0] === 'Source')
              throw new Error('invalid metadata header');
            const size = Buffer.byteLength(file.metadata, 'utf8');
            if (size < 1 || size > 256 * 1024 || size !== file.inflatedBytes) throw new Error('invalid metadata size');
            return { inflatedBytes: size, metadata: file.metadata };
          }
          if (file.status === 'legacy' && file.inflatedBytes === 0 && typeof file.reason === 'string') return undefined;
          if (
            file.status !== 'source' ||
            file.reason !== null ||
            !Number.isSafeInteger(file.inflatedBytes) ||
            file.inflatedBytes < 1 ||
            file.inflatedBytes > 1024 * 1024 * 1024
          )
            throw new Error('invalid Source validation');
          return { inflatedBytes: file.inflatedBytes };
        });
      })) as (ObjectValidation | undefined)[] | undefined;
      if (values) {
        this.stats.batches++;
        this.stats.submitted += objects.length;
        this.stats.sources += values.filter((value) => value && !('metadata' in value)).length;
        this.stats.metadata += values.filter((value) => value && 'metadata' in value).length;
        this.stats.legacy += values.filter((value) => !value).length;
      }
      const selected = await select(values || objects.map(() => undefined));
      let persisted: Set<number> | undefined;
      if (values) {
        if (
          new Set(selected).size !== selected.length ||
          selected.some(
            (index) =>
              !Number.isInteger(index) ||
              index < 0 ||
              index >= objects.length ||
              !values[index] ||
              'metadata' in values[index]!
          )
        )
          throw new Error('invalid native Source selection');
        const commit = Buffer.alloc(12 + selected.length * 4);
        commit.write(`BOC${version}`);
        commit.writeUInt32BE(id, 4);
        commit.writeUInt32BE(selected.length, 8);
        selected.forEach((index, offset) => commit.writeUInt32BE(index, 12 + offset * 4));
        persisted = (await this.request([commit], (response) => {
          if (
            response.version !== version ||
            response.id !== id ||
            !Array.isArray(response.persisted) ||
            !Array.isArray(response.failed)
          )
            throw new Error('invalid commit identity');
          const indices = [...response.persisted, ...response.failed];
          if (
            indices.length !== selected.length ||
            new Set(indices).size !== indices.length ||
            indices.some((index) => !Number.isInteger(index) || !selected.includes(index))
          )
            throw new Error('invalid commit coverage');
          return new Set<number>(response.persisted);
        })) as Set<number> | undefined;
        this.stats.persisted += persisted?.size || 0;
        this.stats.writeFallbacks += selected.length - (persisted?.size || 0);
      }
      await finish(selected, persisted);
    });
    this.tail = operation.catch(() => this.fail('batch processing failed'));
    try {
      await operation;
    } finally {
      this.bytes -= bytes;
      this.count -= objects.length;
    }
  }

  dispose() {
    this.fail('native importer disposed');
  }

  async disposeAndWait() {
    this.dispose();
    await this.stopped;
  }

  private start() {
    if (this.child) return this.child;
    const args = [...this.args, '--objects-dir', this.options.objectsDirectory];
    if (this.options.owner) args.push('--owner', `${this.options.owner.uid}:${this.options.owner.gid}`);
    const child = spawnRustImportTransport(this.executable, args);
    this.child = child;
    this.stopped = new Promise((resolve) => {
      child.once('exit', () => resolve());
      child.once('error', () => resolve());
    });
    child.on('error', (error) => this.fail(`spawn error: ${error.message}`));
    child.on('exit', () => this.fail('native importer exited'));
    for (const stream of [child.stdin, child.stdout, child.stderr])
      stream.on('error', (error) => this.fail(`stream error: ${error.message}`));
    child.stdout.on('end', () => this.fail('native importer output ended'));
    child.stdout.on('data', (chunk: Buffer) => this.receive(chunk));
    child.stderr.on('data', () => undefined);
    return child;
  }

  private request(vectors: Buffer[], parse: Pending['parse']): Promise<unknown> {
    if (this.unavailableReason) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      this.pending = {
        parse,
        resolve,
        timer: setTimeout(() => this.fail('native importer timed out'), this.timeoutMs),
      };
      try {
        const stream = this.start().stdin;
        stream.cork();
        try {
          for (const vector of vectors) stream.write(vector);
        } finally {
          stream.uncork();
        }
      } catch (error) {
        this.fail(`native input error: ${String(error)}`);
      }
    });
  }

  private receive(chunk: Buffer) {
    if (!this.pending || this.outputBytes + chunk.length > 32 * 1024 * 1024)
      return this.fail('unsolicited or oversized native response');
    this.output.push(chunk);
    this.outputBytes += chunk.length;
    const newline = chunk.indexOf(10);
    if (newline < 0) return;
    if (newline !== chunk.length - 1) return this.fail('extra native response bytes');
    try {
      const value = this.pending.parse(
        JSON.parse(Buffer.concat(this.output as unknown as Uint8Array[]).toString('utf8'))
      );
      const pending = this.pending;
      this.pending = undefined;
      this.output = [];
      this.outputBytes = 0;
      clearTimeout(pending.timer);
      pending.resolve(value);
    } catch (error) {
      this.fail(`native protocol error: ${String(error)}`);
    }
  }

  private fail(reason: string) {
    if (this.unavailableReason) return;
    this.unavailableReason = reason;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.resolve(undefined);
      this.pending = undefined;
    }
    this.output = [];
    this.outputBytes = 0;
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
