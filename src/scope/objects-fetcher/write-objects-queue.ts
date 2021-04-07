import PQueue from 'p-queue';
import { concurrentIOLimit } from '../../utils/concurrency';

export class WriteObjectsQueue {
  private queue: PQueue;
  private addedHashes: string[] = [];
  constructor(concurrency = concurrentIOLimit()) {
    this.queue = new PQueue({ concurrency, autoStart: true });
  }
  addImmutableObject<T>(hash: string, fn: () => Promise<T | null>) {
    if (this.addedHashes.includes(hash)) {
      return null;
    }
    this.addedHashes.push(hash);
    return this.add(fn);
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
