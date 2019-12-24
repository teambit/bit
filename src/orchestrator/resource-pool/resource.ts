import { EventEmitter } from 'events';

// TODO - lets talk about this
export enum ResourceEvents {
  Destroyed = 'destroyed',
  Borrowed = 'borrowed',
  Idle = 'idle'
}

export type ResourceOptions = {
  /**
   * need som options
   */
};

// eslint-disable-next-line @typescript-eslint/ban-types
export default abstract class Resource<T extends Object> extends EventEmitter {
  constructor(protected resource: T, private options: ResourceOptions) {
    super();
  }

  private lastUsed: number | undefined;
  private destroyed = false;

  setLastUsed() {
    this.lastUsed = Date.now();
  }

  use(): T {
    this.emit(ResourceEvents.Borrowed);
    this.setLastUsed();
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    return new Proxy(this.resource, {
      get: (object: any, key, proxy) => {
        this.setLastUsed();

        if (key !== 'destroy') {
          return Reflect.get(object, key, proxy);
        }

        self.destroyed = true;

        return (...args: any[]) => {
          const target = object[key];
          this.emit(ResourceEvents.Destroyed);
          return target.apply(object, target, args);
        };
      }
    });
  }

  abstract id: string;

  abstract serialize(): string;

  async destroy(): Promise<void> {
    this.destroyed = true;
  }
}
