import { LRUCache } from 'lru-cache';
import type { InMemoryCache, CacheOptions } from './in-memory-cache';
import { WeakValues } from './weak-values';

export class LRUCacheAdapter<T extends {} = any> implements InMemoryCache<T> {
  private cache: LRUCache<string, T>;
  private weakValues?: WeakValues<object>;
  constructor(options: CacheOptions) {
    const opts = this.getOptions(options);
    this.cache = new LRUCache<string, T>(opts);
    if (options.weak) {
      // an expired entry must not come back, so it's supported only when the cache is bounded by count
      if (!options.maxSize || options.maxBytes || options.maxAge) {
        throw new Error('LRUCacheAdapter: weak is supported only with maxSize');
      }
      this.weakValues = new WeakValues();
    }
  }

  private getOptions(options: CacheOptions): LRUCache.Options<string, T, unknown> {
    if (options.maxBytes) {
      const { defaultEntrySize } = options;
      if (!defaultEntrySize) throw new Error('LRUCacheAdapter: maxBytes requires defaultEntrySize');
      return { maxSize: options.maxBytes, max: options.maxSize, sizeCalculation: () => defaultEntrySize };
    }
    if (options.maxSize) {
      return { max: options.maxSize };
    }
    if (options.maxAge) {
      return { ttl: options.maxAge, ttlAutopurge: true };
    }
    throw new Error('LRUCacheAdapter: either maxSize, maxBytes or maxAge should be provided');
  }

  set(key: string, value: T, size?: number) {
    // lru-cache throws when a size is given to a cache that is not bounded by size, and requires a positive integer.
    const setOptions = this.cache.maxSize && size !== undefined ? { size: Math.max(1, Math.ceil(size)) } : undefined;
    // lru-cache re-accounts the size of an existing key only when its value changes. re-setting the same
    // value with a (more accurate) size would keep the old size, so remove it first.
    if (setOptions && this.cache.has(key)) this.cache.delete(key);
    this.cache.set(key, value, setOptions);
    if (!this.weakValues) return;
    // a primitive can't be held weakly. drop the previous value of the key, so it can't come back once this one is evicted
    if (typeof value === 'object' || typeof value === 'function') this.weakValues.set(key, value);
    else this.weakValues.delete(key);
  }
  get(key: string): T | undefined {
    const value = this.cache.get(key);
    if (value !== undefined || !this.weakValues) return value;
    const evicted = this.weakValues.get(key) as T | undefined;
    if (evicted !== undefined) this.cache.set(key, evicted); // it's in use again
    return evicted;
  }
  delete(key: string) {
    this.cache.delete(key);
    this.weakValues?.delete(key);
  }
  has(key: string): boolean {
    return this.cache.has(key) || this.weakValues?.get(key) !== undefined;
  }
  deleteAll() {
    this.cache.clear();
    this.weakValues?.clear();
  }
  /**
   * with `weak`, it includes evicted entries that are still alive, so clearing by key clears them too.
   */
  keys(): string[] {
    const keys = Array.from(this.cache.keys());
    if (!this.weakValues) return keys;
    return Array.from(new Set([...keys, ...this.weakValues.keys()]));
  }
}
