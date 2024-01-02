import PQueue from 'p-queue';

export class WatchQueue {
  private queue: PQueue;
  constructor(concurrency = 1) {
    this.queue = new PQueue({ concurrency, autoStart: true });
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
