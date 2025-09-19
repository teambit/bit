import { LRUCache } from 'lru-cache';
import type { InMemoryCache, CacheOptions } from './in-memory-cache';

export class LRUCacheAdapter<T extends {} = any> implements InMemoryCache<T> {
  private cache: LRUCache<string, T>;
  constructor(options: CacheOptions) {
    const opts = this.getOptions(options);
    this.cache = new LRUCache<string, T>(opts);
  }

  private getOptions(options: CacheOptions) {
    if (options.maxSize) {
      return { max: options.maxSize };
    }
    if (options.maxAge) {
      return { ttl: options.maxAge, ttlAutopurge: false };
    }
    throw new Error('LRUCacheAdapter: either maxSize or maxAge should be provided');
  }

  set(key: string, value: T) {
    this.cache.set(key, value);
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
