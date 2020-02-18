type ReporterCache = { [id: string]: Reporter };

export type Reporter = {
  pipe: Promise<number | 'Propagation'>;
  stdout: any;
  stderr: any;
};

export type FailStatus = 'Dependency';

export class ExecutionReporter {
  constructor(private cache: ReporterCache = {}) {}

  keys() {
    return Object.keys(this.cache);
  }

  values() {
    return Object.values(this.cache);
  }

  get(componentId: string) {
    return this.cache[componentId];
  }

  set(componentId: string, value: Reporter) {
    this.cache[componentId] = value;
    return this;
  }

  all() {
    return Promise.all(Object.values(this.cache).map(val => val.pipe));
  }

  mapEntries(visit: ([k, obj]: [string, Reporter]) => any[]) {
    Object.entries(this.cache).map(([key, obj]) => {
      return visit([key, obj]);
    });
  }
}
