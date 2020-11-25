// eslint-disable-next-line import/no-unresolved
import { Worker } from 'worker_threads';
import { wrap, Remote } from 'comlink';
import nodeEndpoint from './node-endpoint';

export type InitOptions = {
  /**
   * determine whether stdout should be piped into the parent process.
   */
  stdout: boolean;

  /**
   * determine whether stderr should be piped into the parent process.
   */
  stderr: boolean;

  /**
   * determine whether stdin should be piped into the parent process.
   */
  stdin: boolean;
};

export class HarmonyWorker<T> {
  constructor(readonly name: string, readonly workerPath: string) {}

  private remoteWorker: undefined | Remote<T>;

  private worker: Worker | undefined;

  get stdout() {
    return this.worker?.stdout;
  }

  get stderr() {
    return this.worker?.stderr;
  }

  get stdin() {
    return this.worker?.stdin;
  }

  private getOptions(targetOptions: Partial<InitOptions>) {
    const defaultOptions = {
      stdout: true,
      stderr: true,
      stdin: true,
    };

    return Object.assign(defaultOptions, targetOptions);
  }

  initiate(options: Partial<InitOptions>): Remote<T> {
    const worker = new Worker(this.workerPath, this.getOptions(options));
    this.worker = worker;
    const remoteWorker = wrap<T>(nodeEndpoint(worker));
    this.remoteWorker = remoteWorker;
    return remoteWorker;
  }

  get() {
    return this.remoteWorker;
  }

  async terminate() {
    if (!this.worker) return;
    await this.worker.terminate();
  }
}
