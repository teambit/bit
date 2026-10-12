export {
  getMaxSizeForComponents,
  InMemoryCache,
  getMaxSizeForObjects,
  getCacheOptionsForObjects,
} from './in-memory-cache';
export { createInMemoryCache } from './cache-factory';

export { canReadCacheNatively, captureRustCacheEntries } from './lru-cache-adapter';
