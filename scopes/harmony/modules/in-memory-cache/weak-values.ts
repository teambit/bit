/// <reference lib="es2021.weakref" />

/**
 * values held *weakly*: a value is returned only while something else still references it, and this map never keeps
 * a value alive.
 */
export class WeakValues<T extends object> {
  private refs = new Map<string, WeakRef<T>>();
  private cleanup = new FinalizationRegistry<string>((key) => {
    // the key may have been re-set with another value since this one was registered
    if (!this.refs.get(key)?.deref()) this.refs.delete(key);
  });

  set(key: string, value: T) {
    if (this.get(key) === value) return;
    this.cleanup.register(value, key);
    this.refs.set(key, new WeakRef(value));
  }

  get(key: string): T | undefined {
    return this.refs.get(key)?.deref();
  }

  delete(key: string) {
    this.refs.delete(key);
  }

  clear() {
    this.refs.clear();
  }

  /**
   * keys of the values that are still alive.
   */
  keys(): string[] {
    return Array.from(this.refs.keys()).filter((key) => this.get(key));
  }
}
