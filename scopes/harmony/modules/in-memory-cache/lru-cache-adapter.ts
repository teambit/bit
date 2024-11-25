import LRU from 'lru-cache';
import { InMemoryCache, CacheOptions } from './in-memory-cache';

export class LRUCacheAdapter<T> implements InMemoryCache<T> {
  private cache: LRU;
  constructor(options: CacheOptions) {
    const lruOptions: Record<string, any> = { max: options.maxSize || Infinity };
    if (options.maxAge) lruOptions.maxAge = options.maxAge;
    this.cache = new LRU(lruOptions);
  }
  set(key: string, value: T) {
    this.cache.set(key, value);
  }
  get(key: string): T | undefined {
    return this.cache.get(key);
  }
  delete(key: string) {
    this.cache.del(key);
  }
  has(key: string): boolean {
    return this.cache.has(key);
  }
  deleteAll() {
    this.cache.reset();
  }
  keys() {
    return this.cache.keys();
  }
}
