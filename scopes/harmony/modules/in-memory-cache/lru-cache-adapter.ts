import { LRUCache } from 'lru-cache';
import type { InMemoryCache, CacheOptions } from './in-memory-cache';

export class LRUCacheAdapter<T extends {} = any> implements InMemoryCache<T> {
  private cache: LRUCache<string, T>;
  constructor(options: CacheOptions) {
    const opts = this.getOptions(options);
    this.cache = new LRUCache<string, T>(opts);
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
    const setOptions = this.cache.maxSize && size ? { size: Math.max(1, Math.ceil(size)) } : undefined;
    // lru-cache re-accounts the size of an existing key only when its value changes. re-setting the same
    // value with a (more accurate) size would keep the old size, so remove it first.
    if (setOptions && this.cache.has(key)) this.cache.delete(key);
    this.cache.set(key, value, setOptions);
  }
  get(key: string): T | undefined {
    return this.cache.get(key);
  }
  delete(key: string) {
    this.cache.delete(key);
  }
  has(key: string): boolean {
    return this.cache.has(key);
  }
  deleteAll() {
    this.cache.clear();
  }
  keys(): string[] {
    return Array.from(this.cache.keys());
  }
}
