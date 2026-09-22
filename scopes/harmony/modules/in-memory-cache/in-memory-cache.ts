import { getNumberFromConfig } from '@teambit/config-store';
import {
  CFG_CACHE_MAX_ITEMS_COMPONENTS,
  CFG_CACHE_MAX_ITEMS_OBJECTS,
  CFG_CACHE_MAX_OBJECTS_MB,
} from '@teambit/legacy.constants';

export interface InMemoryCache<T> {
  /**
   * `size` is only relevant when the cache was created with `maxBytes`. it's the approximate memory
   * footprint of the entry. when omitted, `defaultEntrySize` is used.
   */
  set(key: string, value: T, size?: number): void;
  get(key: string): T | undefined;
  delete(key: string): void;
  has(key: string): boolean;
  deleteAll(): void;
  keys(): string[];
}

export type CacheOptions = {
  maxSize?: number; // max number of entries
  maxBytes?: number; // max total size of the entries, as reported by `set`
  defaultEntrySize?: number; // required with `maxBytes`. the size of an entry that was set without a size
  maxAge?: number; // in milliseconds
};

const DEFAULT_MAX_OBJECTS_MB = 256;
const ESTIMATED_OBJECT_SIZE = 32 * 1024;

export function getMaxSizeForComponents(): number {
  return getNumberFromConfig(CFG_CACHE_MAX_ITEMS_COMPONENTS) || 500;
}

/**
 * objects are bounded by their size (see `getCacheOptionsForObjects`), not by their count. a count limit is
 * applied only when configured explicitly.
 */
export function getMaxSizeForObjects(): number | undefined {
  return getNumberFromConfig(CFG_CACHE_MAX_ITEMS_OBJECTS) || undefined;
}

/**
 * a count limit is a poor proxy for memory, as objects vary from a few bytes to a few MBs. too low, and
 * a workspace whose working-set exceeds it keeps evicting and re-parsing the same objects. too high, and
 * a few thousand big objects may cause OOM.
 */
export function getCacheOptionsForObjects(): CacheOptions {
  const maxMb = getNumberFromConfig(CFG_CACHE_MAX_OBJECTS_MB) || DEFAULT_MAX_OBJECTS_MB;
  return { maxSize: getMaxSizeForObjects(), maxBytes: maxMb * 1024 * 1024, defaultEntrySize: ESTIMATED_OBJECT_SIZE };
}
