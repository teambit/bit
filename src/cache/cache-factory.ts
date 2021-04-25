import { InMemoryCache } from './in-memory-cache';
import { NodeCacheAdapter } from './node-cache-adapter';

export function createInMemoryCache<T>(type: 'node' | 'redis' = 'node'): InMemoryCache<T> {
  if (type === 'node') {
    return new NodeCacheAdapter();
  }
  throw new Error(`createInMemoryCache: type "${type}" was not implemented`);
}
