import PQueue from 'p-queue';

export class WriteComponentsQueue {
  private queue: PQueue;
  private processedIds: string[] = [];
  constructor(concurrency = 1) {
    this.queue = new PQueue({ concurrency, autoStart: true });
  }
  addComponent(id: string, fn: () => Promise<void>) {
    this.processedIds.push(id);
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
