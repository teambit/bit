import PQueue from 'p-queue';
import { concurrentIOLimit } from '@teambit/harmony.modules.concurrency';

export class WriteObjectsQueue {
  private queue: PQueue;
  addedHashes: string[] = [];
  added = 0;
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
    this.added += 1;
    return this.queue.add(fn, { priority });
  }
  onIdle(): Promise<void> {
    return this.queue.onIdle();
  }
}
