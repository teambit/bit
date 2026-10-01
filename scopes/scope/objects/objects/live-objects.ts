/// <reference lib="es2021.weakref" />
import type BitObject from './object';

type LiveObjectEntry = {
  ref: WeakRef<BitObject>;
  size?: number;
  /**
   * whether the object may be kept in the (strong) objects cache. big objects are only tracked here.
   */
  cacheable: boolean;
};

/**
 * objects that were loaded or cached, held *weakly*: an object is returned from here only while something
 * else still references it, and this map never keeps an object alive.
 *
 * it complements the size-bounded objects cache. when that cache evicts an object that is still in use
 * (or an object is too big to be cached at all), a later load returns the same instance from here
 * rather than re-reading and re-parsing a duplicate copy of it.
 */
export class LiveObjects {
  private entries = new Map<string, LiveObjectEntry>();
  private cleanup = new FinalizationRegistry<string>((key) => {
    // the key may have been re-set with another object since this one was registered
    if (!this.entries.get(key)?.ref.deref()) this.entries.delete(key);
  });

  set(key: string, object: BitObject, size: number | undefined, cacheable: boolean) {
    const existing = this.entries.get(key);
    if (existing?.ref.deref() !== object) this.cleanup.register(object, key);
    this.entries.set(key, { ref: new WeakRef(object), size, cacheable });
  }

  get(key: string): { object: BitObject; size?: number; cacheable: boolean } | undefined {
    const entry = this.entries.get(key);
    const object = entry?.ref.deref();
    if (!entry || !object) return undefined;
    return { object, size: entry.size, cacheable: entry.cacheable };
  }

  delete(key: string) {
    this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
  }
}
