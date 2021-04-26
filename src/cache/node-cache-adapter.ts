import NodeCache from 'node-cache';
import { InMemoryCache } from './in-memory-cache';

export class NodeCacheAdapter<T> implements InMemoryCache<T> {
  private cache: NodeCache;
  constructor() {
    this.cache = new NodeCache();
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
    this.cache.flushAll();
  }
}
