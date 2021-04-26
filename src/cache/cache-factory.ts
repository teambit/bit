import { InMemoryCache, CacheOptions } from './in-memory-cache';
import { NodeCacheAdapter } from './node-cache-adapter';
import { LRUCacheAdapter } from './lru-cache-adapter';

export function createInMemoryCache<T>(
  options: CacheOptions,
  type: 'node' | 'redis' | 'lru' = 'lru'
): InMemoryCache<T> {
  switch (type) {
    case 'node':
      return new NodeCacheAdapter();
    case 'lru':
      return new LRUCacheAdapter(options);
    default:
      throw new Error(`createInMemoryCache: type "${type}" was not implemented`);
  }
}
