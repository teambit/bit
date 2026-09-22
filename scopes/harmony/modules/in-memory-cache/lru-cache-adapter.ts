import { LRUCache } from 'lru-cache';
import type { InMemoryCache, CacheOptions } from './in-memory-cache';

/**
 * the size of an entry that was set without a size, in a cache that is bounded by bytes.
 */
export const DEFAULT_ENTRY_SIZE = 32 * 1024;

export class LRUCacheAdapter<T extends {} = any> implements InMemoryCache<T> {
  private cache: LRUCache<string, T>;
  private boundedByBytes: boolean;
  constructor(options: CacheOptions) {
    this.boundedByBytes = Boolean(options.maxBytes);
    const opts = this.getOptions(options);
    this.cache = new LRUCache<string, T>(opts);
  }

  private getOptions(options: CacheOptions): LRUCache.Options<string, T, unknown> {
    if (options.maxBytes) {
      return {
        maxSize: options.maxBytes,
        sizeCalculation: () => DEFAULT_ENTRY_SIZE,
        ...(options.maxSize ? { max: options.maxSize } : {}),
      };
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
    const setOptions = this.boundedByBytes && size ? { size: Math.max(1, Math.ceil(size)) } : undefined;
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
