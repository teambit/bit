import { getNumberFromConfig } from '../api/consumer/lib/global-config';
import { CFG_CONCURRENCY_COMPONENTS, CFG_CONCURRENCY_FETCH, CFG_CONCURRENCY_IO } from '../constants';

const CONCURRENT_IO_LIMIT = 100;
const CONCURRENT_COMPONENTS_LIMIT = 50;
const CONCURRENT_FETCH_LIMIT = 15;

/**
 * limit number of files to read/write/delete/symlink at the same time
 */
export function concurrentIOLimit(): number {
  return getNumberFromConfig(CFG_CONCURRENCY_IO) || CONCURRENT_IO_LIMIT;
}

/**
 * limit number of components to load at the same time
 */
export function concurrentComponentsLimit(): number {
  return getNumberFromConfig(CFG_CONCURRENCY_COMPONENTS) || CONCURRENT_COMPONENTS_LIMIT;
}

/**
 * limit number of scopes to fetch from at the same time
 */
export function concurrentFetchLimit(): number {
  return getNumberFromConfig(CFG_CONCURRENCY_FETCH) || CONCURRENT_FETCH_LIMIT;
}
