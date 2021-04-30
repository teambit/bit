import { InMemoryCache, CacheOptions } from './in-memory-cache';
import { LRUCacheAdapter } from './lru-cache-adapter';

export function createInMemoryCache<T>(
  options: CacheOptions,
  type: 'node' | 'redis' | 'lru' = 'lru'
): InMemoryCache<T> {
  switch (type) {
    case 'lru':
      return new LRUCacheAdapter(options);
    default:
      throw new Error(`createInMemoryCache: type "${type}" was not implemented`);
  }
}
