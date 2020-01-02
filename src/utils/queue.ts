import PQueue from 'p-queue';

export default class Queue {
  private queue: PQueue;
  constructor(private concurrency = 5, private autoStart = true) {
    this.queue = new PQueue({ concurrency, autoStart });
  }
  addAll(fns: Array<() => any>): Promise<any[]> {
    return this.queue.addAll(fns);
  }
  add(fn: () => any, priority: number): Promise<any> {
    return this.queue.add(fn, { priority });
  }
  pause(): void {
    this.queue.pause();
  }
  size(): number {
    return this.queue.size;
  }
  onEmpty(): Promise<void> {
    return this.queue.onEmpty();
  }
  onIdle(): Promise<void> {
    return this.queue.onIdle();
  }
}
