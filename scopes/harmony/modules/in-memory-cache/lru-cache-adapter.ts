import { LRUCache } from 'lru-cache';
import type { InMemoryCache, CacheOptions } from './in-memory-cache';
import { WeakValues } from './weak-values';
import { types } from 'util';

export class LRUCacheAdapter<T extends {} = any> implements InMemoryCache<T> {
  private cache: LRUCache<string, T>;
  private weakValues?: WeakValues<object>;
  constructor(options: CacheOptions) {
    const opts = this.getOptions(options);
    this.cache = new LRUCache<string, T>(opts);
    if (options.weak) {
      // an expired entry must not come back, so it's supported only when the cache is bounded by count
      if (!options.maxSize || options.maxBytes || options.maxAge) {
        throw new Error('LRUCacheAdapter: weak is supported only with maxSize');
      }
      this.weakValues = new WeakValues();
    }
  }

  private getOptions(options: CacheOptions): LRUCache.Options<string, T, unknown> {
    if (options.maxBytes) {
      const { defaultEntrySize } = options;
      if (!defaultEntrySize) throw new Error('LRUCacheAdapter: maxBytes requires defaultEntrySize');
      return { maxSize: options.maxBytes, max: options.maxSize, sizeCalculation: () => defaultEntrySize };
    }
    if (options.maxSize) {
      return { max: options.maxSize };
    }
    if (options.maxAge) {
      return { ttl: options.maxAge, ttlAutopurge: true };
    }
    throw new Error('LRUCacheAdapter: either maxSize, maxBytes or maxAge should be provided');
  }

  set(key: string, value: T, size?: number) {
    // lru-cache throws when a size is given to a cache that is not bounded by size, and requires a positive integer.
    const setOptions = this.cache.maxSize && size !== undefined ? { size: Math.max(1, Math.ceil(size)) } : undefined;
    // lru-cache re-accounts the size of an existing key only when its value changes. re-setting the same
    // value with a (more accurate) size would keep the old size, so remove it first.
    if (setOptions && this.cache.has(key)) this.cache.delete(key);
    this.cache.set(key, value, setOptions);
    if (!this.weakValues) return;
    // a primitive can't be held weakly. drop the previous value of the key, so it can't come back once this one is evicted
    if ((typeof value === 'object' && value !== null) || typeof value === 'function') this.weakValues.set(key, value);
    else this.weakValues.delete(key);
  }
  get(key: string): T | undefined {
    const value = this.cache.get(key);
    if (value !== undefined || !this.weakValues) return value;
    const evicted = this.weakValues.get(key) as T | undefined;
    if (evicted !== undefined) this.cache.set(key, evicted); // it's in use again
    return evicted;
  }
  delete(key: string) {
    this.cache.delete(key);
    this.weakValues?.delete(key);
  }
  has(key: string): boolean {
    return this.cache.has(key) || this.weakValues?.get(key) !== undefined;
  }
  deleteAll() {
    this.cache.clear();
    this.weakValues?.clear();
  }
  /**
   * with `weak`, it includes evicted entries that are still alive, so clearing by key clears them too.
   */
  keys(): string[] {
    const keys = Array.from(this.cache.keys());
    if (!this.weakValues) return keys;
    return Array.from(new Set([...keys, ...this.weakValues.keys()]));
  }
}

const nativeAdapterMethods = ['get', 'set'].map((name) => [name, LRUCacheAdapter.prototype[name]] as const);
const nativeLruMethods = ['get', 'set', 'has', 'delete'].map((name) => [name, LRUCache.prototype[name]] as const);
const nativeDump = LRUCache.prototype.dump;
const nativeUnshift = Array.prototype.unshift;

/** Read object aliases without changing the LRU order or observing expiry callbacks. */
export function captureRustCacheEntries(cache: InMemoryCache<{}>, keys?: string[]): Array<[string, object]> | undefined {
  if (keys) {
    const values = lookupRustCacheEntries(cache, keys);
    return values?.flatMap((entry, index) => entry.value ? [[keys[index], entry.value] as [string, object]] : []);
  }
  if (types.isProxy(cache) || !canReadCacheNatively(cache)) return undefined;
  const inner = Object.getOwnPropertyDescriptor(cache, 'cache')?.value;
  if (
    types.isProxy(inner) ||
    (Object.getOwnPropertyDescriptor(inner, 'dump') || Object.getOwnPropertyDescriptor(LRUCache.prototype, 'dump'))?.value !== nativeDump ||
    Object.getOwnPropertyDescriptor(Array.prototype, 'unshift')?.value !== nativeUnshift ||
    Object.getOwnPropertyDescriptor(inner, 'ttl')?.value !== 0
  ) return undefined;
  const dumped = nativeDump.call(inner);
  if (dumped.length > 4096) return undefined;
  const result: Array<[string, object]> = [];
  for (let index = 0; index < dumped.length; index++) {
    const [key, entry] = dumped[index];
    if (typeof key !== 'string' || entry.ttl || !entry.value || typeof entry.value !== 'object') return undefined;
    result[index] = [key, entry.value];
  }
  return result;
}
/** Native metadata readers must not call custom cache hooks speculatively. */
export function canReadCacheNatively(cache: InMemoryCache<{}>): boolean {
  if (!cache || Object.getPrototypeOf(cache) !== LRUCacheAdapter.prototype) return false;
  const inner = Object.getOwnPropertyDescriptor(cache, 'cache')?.value;
  const weak = Object.getOwnPropertyDescriptor(cache, 'weakValues');
  return Boolean(
    inner &&
      Object.getPrototypeOf(inner) === LRUCache.prototype &&
      (!weak || ('value' in weak && !weak.value)) &&
      nativeAdapterMethods.every(
        ([name, method]) =>
          (
            Object.getOwnPropertyDescriptor(cache, name) ||
            Object.getOwnPropertyDescriptor(LRUCacheAdapter.prototype, name)
          )?.value === method
      ) &&
      nativeLruMethods.every(
        ([name, method]) =>
          (Object.getOwnPropertyDescriptor(inner, name) || Object.getOwnPropertyDescriptor(LRUCache.prototype, name))
            ?.value === method
      )
  );
}

const nativeExpose = LRUCache.unsafeExposeInternals;
const nativeMapGet = Map.prototype.get;

/** Inspect one alias without promoting it or allocating a dump of the entire LRU. */
export function lookupRustCacheEntry(cache: InMemoryCache<{}>, key: string): { value?: object } | undefined {
  return lookupRustCacheEntries(cache, [key])?.[0];
}

/** Validate the shared LRU once, then inspect only the requested aliases without promotion. */
function lookupRustCacheEntries(cache: InMemoryCache<{}>, keys: string[]): Array<{ value?: object }> | undefined {
  if (
    types.isProxy(cache) ||
    !canReadCacheNatively(cache) ||
    Object.getOwnPropertyDescriptor(LRUCache, 'unsafeExposeInternals')?.value !== nativeExpose ||
    Object.getOwnPropertyDescriptor(Map.prototype, 'get')?.value !== nativeMapGet
  )
    return undefined;
  const inner = Object.getOwnPropertyDescriptor(cache, 'cache')?.value;
  if (!inner || types.isProxy(inner)) return undefined;
  try {
    // This dependency's explicit introspection API exposes only private storage here.
    // Any TTL tracking stays canonical, even when its public default ttl is zero.
    const fields = nativeExpose(inner);
    if (
      fields.ttls ||
      types.isProxy(fields.keyMap) ||
      Object.getPrototypeOf(fields.keyMap) !== Map.prototype ||
      Reflect.ownKeys(fields.keyMap).length ||
      !Array.isArray(fields.valList) ||
      types.isProxy(fields.valList)
    )
      return undefined;
    const result: Array<{ value?: object }> = [];
    for (const key of keys) {
      const index = nativeMapGet.call(fields.keyMap, key);
      if (index === undefined) { result.push({}); continue; }
      if (!Number.isSafeInteger(index) || index < 0) return undefined;
      const entry = Object.getOwnPropertyDescriptor(fields.valList, String(index));
      if (!entry || !('value' in entry)) return undefined;
      const value = entry.value;
      if (value === undefined) { result.push({}); continue; }
      // Background fetch promises have separate alias semantics; never inspect their properties.
      if (!value || typeof value !== 'object' || types.isPromise(value)) return undefined;
      result.push({ value });
    }
    return result;
  } catch {
    return undefined;
  }
}
