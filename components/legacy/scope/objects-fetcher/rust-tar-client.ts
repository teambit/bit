import assert from 'assert';
import { spawnRustImportTransport } from './rust-import-transport';
import path from 'path';
import fs from 'fs/promises';

export type TarRecord = {
  name: string;
  offset: number;
  size: number;
  sha1: string | null;
  text: string | null;
  validation: {
    hash: string;
    status: 'source' | 'legacy' | 'metadata';
    reason: string | null;
    inflatedBytes: number;
    metadata?: string;
  } | null;
};
export type TarDecision = {
  selected?: number[];
  error?: unknown;
  settle?: (persisted?: ReadonlySet<number>, repair?: boolean) => Promise<void>;
};
export type TarOptions = {
  objectsDirectory?: string;
  owner?: { uid: number; gid: number } | null;
  signal?: AbortSignal;
  timeoutMs?: number;
  digest?: boolean;
  metadata?: boolean;
  awaitSelection?: boolean;
};
type Frame = {
  version: number;
  id: number;
  sequence: number;
  done: boolean;
  fallback: boolean;
  error: string | null;
  files: TarRecord[];
  persisted: number[];
  failed: number[];
};

const MAX_FRAME = 8 * 1024 * 1024 + 1;
export class TarTimeoutError extends Error {
  constructor() {
    super('tar operation timed out');
    this.name = 'TarTimeoutError';
  }
}
export type TarProgressProducer = (signal: AbortSignal) => AsyncIterable<{ bytes: number }>;
type Consume = (files: TarRecord[], signal: AbortSignal) => Promise<TarDecision>;

export function readTarBatches(executable: string, archive: string, options: TarOptions, consume: Consume) {
  return readArchive(executable, archive, options, consume);
}
/** The producer owns an append-only file; successful completion declares EOF. */
export function readProgressiveTarBatches(
  executable: string,
  archive: string,
  options: TarOptions,
  progress: TarProgressProducer,
  consume: Consume
) {
  return readArchive(executable, archive, options, consume, progress);
}
async function readArchive(
  executable: string,
  archive: string,
  options: TarOptions,
  consume: Consume,
  progress?: TarProgressProducer
) {
  options.signal?.throwIfAborted();
  let size = (await fs.stat(archive)).size;
  if (progress) size = 0;
  options.signal?.throwIfAborted();
  const args = options.objectsDirectory ? ['--objects-dir', options.objectsDirectory] : [];
  if (options.owner) args.push('--owner', `${options.owner.uid}:${options.owner.gid}`);
  const child = spawnRustImportTransport(executable, args);
  let output = Buffer.alloc(0),
    failure: Error | undefined,
    pending: { resolve: (frame: Frame) => void; reject: (error: Error) => void } | undefined,
    ending = false,
    closed = false;
  let frames: Frame[] = [],
    sequence = 0,
    count = 0,
    persisted = 0,
    killTimer: ReturnType<typeof setTimeout> | undefined,
    settlement: TarDecision['settle'],
    acknowledged: ReadonlySet<number> | undefined,
    cancelled = false,
    selectionTask: Promise<TarDecision> | undefined,
    producerTask: Promise<void> | undefined;
  const selectionControl = new AbortController();
  let rejectInterrupted!: (error: Error) => void;
  const interrupted = new Promise<never>((_, reject) => {
    rejectInterrupted = reject;
  });
  interrupted.catch(() => undefined);
  const stopped = new Promise<void>((resolve) =>
    child.once('close', (code) => {
      closed = true;
      clearTimeout(killTimer);
      if (code !== 0 || !ending) fail(new Error(`tar helper exited (${code})`));
      resolve();
    })
  );
  function fail(error: Error) {
    if (failure) return;
    failure = error;
    selectionControl.abort(error);
    rejectInterrupted(error);
    pending?.reject(error);
    pending = undefined;
    if (!closed) {
      child.kill();
      killTimer = setTimeout(() => child.kill('SIGKILL'), 250);
    }
  }
  child.on('error', fail);
  for (const stream of [child.stdin, child.stdout, child.stderr]) stream.on('error', fail);
  child.stderr.on('data', () => undefined);
  child.stdout.on('data', (chunk) => {
    if (failure) return;
    if (output.length + chunk.length > MAX_FRAME) return fail(new Error('oversized tar response'));
    output = Buffer.concat([output, chunk]);
    let newline;
    try {
      while ((newline = output.indexOf(10)) >= 0) {
        const frame = JSON.parse(output.subarray(0, newline).toString());
        output = output.subarray(newline + 1);
        if (pending) {
          pending.resolve(frame);
          pending = undefined;
        } else {
          frames.push(frame);
          assert.ok(frames.length <= 2, 'unsolicited tar responses');
        }
      }
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  });
  const abort = () => {
    cancelled = true;
    fail(options.signal!.reason instanceof Error ? options.signal!.reason : new Error('tar operation aborted'));
  };
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  const timer = setTimeout(() => {
    cancelled = true;
    fail(new TarTimeoutError());
  }, options.timeoutMs || 120000);
  function next(): Promise<Frame> {
    if (failure) return Promise.reject(failure);
    if (frames.length) return Promise.resolve(frames.shift()!);
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
    });
  }
  function write(bytes: Buffer) {
    if (failure) return Promise.reject(failure);
    return new Promise<void>((resolve, reject) =>
      child.stdin.write(bytes, (error) => (error ? reject(error) : resolve()))
    );
  }
  try {
    const archivePath = Buffer.from(path.resolve(archive));
    const request = Buffer.alloc(16 + archivePath.length);
    request.write(progress ? 'BTI2' : 'BTI1');
    request.writeUInt32BE(1, 4);
    request.writeUInt32BE((options.digest ? 1 : 0) | (options.metadata ? 2 : 0), 8);
    request.writeUInt32BE(archivePath.length, 12);
    archivePath.copy(request, 16);
    await write(request);
    if (progress) {
      producerTask = (async () => {
        for await (const update of progress(selectionControl.signal)) {
          selectionControl.signal.throwIfAborted();
          assert.ok(Number.isSafeInteger(update.bytes) && update.bytes >= size && update.bytes <= 2 * 1024 ** 3);
          size = update.bytes;
          await write(progressFrame(size, false));
        }
        selectionControl.signal.throwIfAborted();
        await write(progressFrame(size, true));
      })().catch((error) => fail(error instanceof Error ? error : new Error(String(error))));
    }
    for (;;) {
      const response = await next();
      assert.equal(response.version, 1);
      assert.equal(response.id, 1);
      assert.equal(response.sequence, sequence);
      assert.equal(typeof response.done, 'boolean');
      assert.equal(typeof response.fallback, 'boolean');
      assert.ok(response.error === null || typeof response.error === 'string');
      assert.ok(Array.isArray(response.files));
      if (response.done) {
        assert.equal(response.files.length, 0);
        ending = true;
        child.stdin.end();
        await stopped;
        if (failure) throw failure;
        assert.equal(frames.length, 0);
        assert.equal(output.length, 0);
        if (response.error) throw new Error(response.error);
        if (response.fallback) throw new Error('native tar fallback required');
        await producerTask;
        if (failure) throw failure;
        return { count, persisted, batches: sequence };
      }
      assert.equal(response.fallback, false);
      assert.equal(response.error, null);
      assert.ok(response.files.length >= 1 && response.files.length <= 16);
      let metadataBytes = 0;
      for (const file of response.files) {
        validate(file, size, options.digest, options.metadata);
        if (file.validation?.status === 'metadata') metadataBytes += file.validation.inflatedBytes;
      }
      assert.ok(metadataBytes <= 512 * 1024, 'oversized tar metadata batch');
      selectionTask = Promise.resolve().then(() => consume(response.files, selectionControl.signal));
      const decision = await Promise.race([selectionTask, interrupted]);
      selectionTask = undefined;
      settlement = decision.settle;
      acknowledged = undefined;
      const selected = decision.selected || [];
      assert.equal(new Set(selected).size, selected.length);
      for (const index of selected) {
        assert.ok(Number.isSafeInteger(index) && index >= 0 && index < response.files.length);
        assert.equal(response.files[index].validation?.status, 'source');
      }
      const commit = Buffer.alloc(16 + selected.length * 4);
      commit.write('BTC1');
      commit.writeUInt32BE(1, 4);
      commit.writeUInt32BE(sequence, 8);
      commit.writeUInt32BE(selected.length, 12);
      selected.forEach((index, offset) => commit.writeUInt32BE(index, 16 + offset * 4));
      await write(commit);
      const ack = await next();
      assert.equal(ack.version, 1);
      assert.equal(ack.id, 1);
      assert.equal(ack.sequence, sequence);
      assert.ok(Array.isArray(ack.persisted) && Array.isArray(ack.failed));
      const coverage = [...ack.persisted, ...ack.failed];
      assert.equal(coverage.length, selected.length);
      assert.equal(new Set(coverage).size, coverage.length);
      assert.ok(coverage.every((index) => selected.includes(index)));
      acknowledged = new Set(ack.persisted);
      if (ack.failed.length) throw new Error('native tar Source persistence failed');
      const settle = settlement;
      settlement = undefined;
      await settle?.(acknowledged);
      persisted += ack.persisted.length;
      count += response.files.length;
      sequence++;
      if (decision.error) throw decision.error;
    }
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
    if (!closed) fail(new Error('tar session disposed'));
    if (progress && !selectionControl.signal.aborted) selectionControl.abort(new Error('tar session disposed'));
    await stopped;
    await producerTask;
    if (options.awaitSelection && selectionTask) {
      try {
        const decision = await selectionTask;
        settlement = decision.settle;
        acknowledged = undefined;
      } catch {
        // Selection failed before returning a settlement; its original error remains authoritative.
      }
    }
    const settle = settlement;
    settlement = undefined;
    await settle?.(acknowledged, !cancelled);
  }
}
function progressFrame(bytes: number, done: boolean) {
  const frame = Buffer.alloc(20);
  frame.write('BTP1');
  frame.writeUInt32BE(1, 4);
  frame.writeBigUInt64BE(BigInt(bytes), 8);
  frame.writeUInt32BE(Number(done), 16);
  return frame;
}
function validate(file: TarRecord, size: number, digest?: boolean, metadata?: boolean) {
  assert.equal(typeof file.name, 'string');
  assert.ok(Buffer.byteLength(file.name) <= 65536);
  assert.ok(Number.isSafeInteger(file.offset) && file.offset >= 0);
  assert.ok(Number.isSafeInteger(file.size) && file.size >= 0 && file.size <= 128 * 1024 * 1024);
  assert.ok(file.offset + file.size <= size);
  assert.ok(digest ? typeof file.sha1 === 'string' && /^[a-f0-9]{40}$/.test(file.sha1) : file.sha1 === null);
  const marker = ['.BIT.START', '.BIT.END', '.BIT.ERROR'].includes(file.name);
  assert.ok(marker ? typeof file.text === 'string' && Buffer.byteLength(file.text) <= 65536 * 3 : file.text === null);
  if (file.validation) {
    const value = file.validation;
    const hash = file.name.split('/')[1] ?? file.name;
    assert.equal(value.hash, hash);
    if (value.status === 'metadata') {
      assert.equal(metadata, true);
      assert.equal(value.reason, null);
      assert.equal(typeof value.metadata, 'string');
      const bytes = Buffer.from(value.metadata!, 'utf8');
      assert.equal(bytes.toString('utf8'), value.metadata, 'metadata must be lossless UTF-8');
      const end = value.metadata!.indexOf('\0');
      assert.ok(end >= 0 && end < 256, 'invalid metadata header');
      assert.notEqual(value.metadata!.slice(0, end).split(' ')[0], 'Source');
      assert.equal(bytes.length, value.inflatedBytes);
      assert.ok(value.inflatedBytes >= 1 && value.inflatedBytes <= 256 * 1024);
    } else if (value.status === 'source') {
      assert.equal(value.metadata, undefined);
      assert.equal(value.reason, null);
      assert.ok(
        Number.isSafeInteger(value.inflatedBytes) &&
          value.inflatedBytes >= 1 &&
          value.inflatedBytes <= 1024 * 1024 * 1024
      );
    } else {
      assert.equal(value.status, 'legacy');
      assert.equal(value.metadata, undefined);
      assert.equal(value.inflatedBytes, 0);
      assert.equal(typeof value.reason, 'string');
    }
  }
}
