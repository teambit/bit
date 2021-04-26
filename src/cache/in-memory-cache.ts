import { getNumberFromConfig } from '../api/consumer/lib/global-config';
import { CFG_CACHE_MAX_ITEMS_COMPONENTS, CFG_CACHE_MAX_ITEMS_OBJECTS } from '../constants';

export interface InMemoryCache<T> {
  set(key: string, value: T): void;
  get(key: string): T | undefined;
  delete(key: string): void;
  has(key: string): boolean;
  deleteAll(): void;
}

export type CacheOptions = {
  maxSize?: number;
};

export function getMaxSizeForComponents(): number {
  return getNumberFromConfig(CFG_CACHE_MAX_ITEMS_COMPONENTS) || 1000;
}

export function getMaxSizeForObjects(): number {
  return getNumberFromConfig(CFG_CACHE_MAX_ITEMS_OBJECTS) || 10000;
}
