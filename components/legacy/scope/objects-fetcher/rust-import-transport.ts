import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';
import { availableParallelism } from 'os';
import { PassThrough, Writable } from 'stream';

type StreamEvent = { kind: 'input' | 'output' | 'closed'; data?: Buffer; error?: string };
type Engine = { write(bytes: Buffer): void; writev(parts: Buffer[]): void; end(): void; close(): void };
type Binding = {
  ImportStreamEngine?: new (
    callback: (event: StreamEvent) => void,
    threads: number,
    directory?: string,
    uid?: number,
    gid?: number
  ) => Engine;
};
type Options = { threads: number; directory?: string; uid?: number; gid?: number };
export type RustImportTransport = ChildProcessWithoutNullStreams | NativeImportTransport;

class NativeImportTransport extends EventEmitter {
  readonly backend = 'addon';
  readonly stdin: Writable;
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  private readonly engine: Engine;
  private pendingWrite?: (error?: Error | null) => void;
  private inputEnded = false;
  private closed = false;
  private requestedSignal?: NodeJS.Signals;

  constructor(EngineConstructor: NonNullable<Binding['ImportStreamEngine']>, options: Options) {
    super();
    this.engine = new EngineConstructor(
      (event) => this.receive(event),
      options.threads,
      options.directory,
      options.uid,
      options.gid
    );
    this.stdin = new Writable({
      write: (bytes, _encoding, callback) => this.write(bytes, callback),
      writev: (chunks, callback) =>
        this.write(
          chunks.map(({ chunk }) => chunk),
          callback
        ),
      final: (callback) => {
        this.inputEnded = true;
        this.engine.end();
        callback();
      },
      destroy: (error, callback) => {
        if (!this.inputEnded) this.engine.close();
        const pending = this.pendingWrite;
        this.pendingWrite = undefined;
        pending?.(error || new Error('native import input closed'));
        callback(error);
      },
    });
  }

  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    if (this.closed) return false;
    this.requestedSignal = signal;
    this.engine.close();
    return true;
  }

  private write(bytes: Buffer | Buffer[], callback: (error?: Error | null) => void) {
    if (Array.isArray(bytes) ? bytes.every((part) => !part.length) : !bytes.length) return callback();
    if (this.closed || this.requestedSignal) return callback(new Error('native import input closed'));
    this.pendingWrite = callback;
    try {
      if (Array.isArray(bytes)) this.engine.writev(bytes);
      else this.engine.write(bytes);
    } catch (error) {
      this.pendingWrite = undefined;
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private receive(event: StreamEvent) {
    if (this.closed) return;
    if (event.kind === 'input') {
      const pending = this.pendingWrite;
      this.pendingWrite = undefined;
      pending?.();
    } else if (event.kind === 'output') {
      this.stdout.write(event.data!);
    } else if (event.kind === 'closed') {
      this.closed = true;
      this.exitCode = this.requestedSignal ? null : event.error ? 1 : 0;
      this.signalCode = this.requestedSignal || null;
      this.stdin.destroy();
      this.stdout.end();
      this.stderr.end();
      queueMicrotask(() => {
        this.emit('exit', this.exitCode, this.signalCode);
        this.emit('close', this.exitCode, this.signalCode);
      });
    }
  }
}

/** Interactive selection waits on its own protocol thread, leaving shared Rayon workers available. */
export function spawnRustImportTransport(executable: string, args: string[]): RustImportTransport {
  const options = process.env.BIT_RUST_CLIENT_VCS === 'on' ? nativeOptions(args) : undefined;
  if (options) {
    try {
      // Resolve after the defining models have initialized; legacy.scope and objects can load cyclically.
      const addon = require('@teambit/objects').resolveRustWorkspaceAddon(executable);
      const binding = addon && (require(addon) as Binding);
      if (binding?.ImportStreamEngine) return new NativeImportTransport(binding.ImportStreamEngine, options);
    } catch {
      // Loading or construction may decline before any input has been submitted.
    }
  }
  return spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
}

function nativeOptions(args: string[]): Options | undefined {
  const options: Options = { threads: Math.min(4, availableParallelism()) };
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index],
      value = args[index + 1];
    if (!value || seen.has(key)) return undefined;
    seen.add(key);
    if (key === '--objects-dir') options.directory = value;
    else if (key === '--threads' && /^[1-8]$/.test(value)) options.threads = Number(value);
    else if (key === '--owner' && /^[0-9]+:[0-9]+$/.test(value)) {
      const [uid, gid] = value.split(':').map(Number);
      if (![uid, gid].every((part) => Number.isSafeInteger(part) && part <= 0xffffffff)) return undefined;
      options.uid = uid;
      options.gid = gid;
    } else return undefined;
  }
  return options;
}
