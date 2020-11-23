import { Worker } from 'worker_threads';
import { wrap, Remote } from 'comlink';
import nodeEndpoint from './node-endpoint';

export class HarmonyWorker<T> {
  constructor(readonly name: string, readonly workerPath: string) // readonly worker: Worker
  {}

  private remoteWorker: undefined | Remote<T>;

  private worker: Worker | undefined;

  initiate(): Remote<T> {
    const worker = new Worker(this.workerPath);
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
