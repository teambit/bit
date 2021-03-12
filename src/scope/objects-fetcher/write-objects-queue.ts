import PQueue from 'p-queue';
import { CONCURRENT_IO_LIMIT } from '../../constants';

export class WriteObjectsQueue {
  private queue: PQueue;
  private addedHashes: string[] = [];
  constructor(concurrency = CONCURRENT_IO_LIMIT) {
    this.queue = new PQueue({ concurrency, autoStart: true });
  }
  addImmutableObject(hash: string, fn: () => Promise<void>) {
    if (this.addedHashes.includes(hash)) {
      return;
    }
    this.addedHashes.push(hash);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.add(fn);
  }
  getQueue() {
    return this.queue;
  }
  add<T>(fn: () => T, priority?: number): Promise<T> {
    return this.queue.add(fn, { priority });
  }
  onIdle(): Promise<void> {
    return this.queue.onIdle();
  }
}
