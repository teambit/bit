/// <reference lib="es2021.weakref" />
import type BitObject from './object';
import { types } from 'util';

type LiveObjectEntry = {
  ref: WeakRef<BitObject>;
  size?: number;
  /**
   * whether the object may be kept in the (strong) objects cache. big objects are only tracked here.
   */
  cacheable: boolean;
};

/**
 * objects that were loaded or cached, held *weakly*: an object is returned from here only while something
 * else still references it, and this map never keeps an object alive.
 *
 * it complements the size-bounded objects cache. when that cache evicts an object that is still in use
 * (or an object is too big to be cached at all), a later load returns the same instance from here
 * rather than re-reading and re-parsing a duplicate copy of it.
 */
export class LiveObjects {
  private entries = new Map<string, LiveObjectEntry>();
  private cleanup = new FinalizationRegistry<string>((key) => {
    // the key may have been re-set with another object since this one was registered
    if (!this.entries.get(key)?.ref.deref()) this.entries.delete(key);
  });

  set(key: string, object: BitObject, size: number | undefined, cacheable: boolean) {
    const existing = this.entries.get(key);
    if (existing?.ref.deref() !== object) this.cleanup.register(object, key);
    this.entries.set(key, { ref: new WeakRef(object), size, cacheable });
  }

  get(key: string): { object: BitObject; size?: number; cacheable: boolean } | undefined {
    const entry = this.entries.get(key);
    const object = entry?.ref.deref();
    if (!entry || !object) return undefined;
    return { object, size: entry.size, cacheable: entry.cacheable };
  }

  delete(key: string) {
    this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
  }
}

const nativeLiveMethods = ['get', 'set'].map((name) => [name, LiveObjects.prototype[name]] as const);
const nativeEntriesGet = Map.prototype.get;
const nativeEntriesForEach = Map.prototype.forEach;
const nativeWeakDeref = WeakRef.prototype.deref;

/** Snapshot weak aliases without resurrecting them into the strong LRU cache. */
export function captureRustLiveObjects(live: LiveObjects): Array<[string, BitObject]> | undefined {
  if (types.isProxy(live) || !canReadLiveObjectsNatively(live)) return undefined;
  const entries = Object.getOwnPropertyDescriptor(live, 'entries')?.value;
  if (
    types.isProxy(entries) ||
    Object.getOwnPropertyDescriptor(Map.prototype, 'forEach')?.value !== nativeEntriesForEach ||
    Object.getOwnPropertyDescriptor(WeakRef.prototype, 'deref')?.value !== nativeWeakDeref
  ) return undefined;
  const result: Array<[string, BitObject]> = [];
  let valid = true;
  nativeEntriesForEach.call(entries, (entry: unknown, key: unknown) => {
    if (!valid) return;
    if (!entry || typeof entry !== 'object' || types.isProxy(entry) || Object.getPrototypeOf(entry) !== Object.prototype) {
      valid = false;
      return;
    }
    const fields = Object.getOwnPropertyDescriptors(entry);
    const ref = fields.ref?.value;
    if (
      typeof key !== 'string' || !ref || types.isProxy(ref) ||
      Object.getPrototypeOf(ref) !== WeakRef.prototype ||
      Reflect.ownKeys(ref).length ||
      Reflect.ownKeys(fields).some((field) => !('value' in Reflect.get(fields, field)))
    ) {
      valid = false;
      return;
    }
    const object = nativeWeakDeref.call(ref) as BitObject | undefined;
    if (object) result[result.length] = [key, object];
    if (result.length > 4096) valid = false;
  });
  return valid ? result : undefined;
}
/** Keep native cache inspections on the canonical weak-object registry. */
export function canReadLiveObjectsNatively(live: LiveObjects): boolean {
  if (!live || Object.getPrototypeOf(live) !== LiveObjects.prototype) return false;
  const entries = Object.getOwnPropertyDescriptor(live, 'entries')?.value;
  return Boolean(
    entries &&
      Object.getPrototypeOf(entries) === Map.prototype &&
      (Object.getOwnPropertyDescriptor(entries, 'get') || Object.getOwnPropertyDescriptor(Map.prototype, 'get'))
        ?.value === nativeEntriesGet &&
      nativeLiveMethods.every(
        ([name, method]) =>
          (Object.getOwnPropertyDescriptor(live, name) || Object.getOwnPropertyDescriptor(LiveObjects.prototype, name))
            ?.value === method
      )
  );
}

/** Look up one surviving weak alias without visiting or resurrecting unrelated entries. */
export function lookupRustLiveObject(live: LiveObjects, key: string): { value?: BitObject } | undefined {
  if (
    types.isProxy(live) ||
    !canReadLiveObjectsNatively(live) ||
    Object.getOwnPropertyDescriptor(WeakRef.prototype, 'deref')?.value !== nativeWeakDeref
  )
    return undefined;
  const entries = Object.getOwnPropertyDescriptor(live, 'entries')?.value;
  if (types.isProxy(entries)) return undefined;
  try {
    const entry = nativeEntriesGet.call(entries, key);
    if (entry === undefined) return {};
    if (
      !entry ||
      typeof entry !== 'object' ||
      types.isProxy(entry) ||
      Object.getPrototypeOf(entry) !== Object.prototype
    )
      return undefined;
    const fields = Object.getOwnPropertyDescriptors(entry),
      ref = fields.ref?.value;
    if (
      !ref ||
      types.isProxy(ref) ||
      Object.getPrototypeOf(ref) !== WeakRef.prototype ||
      Reflect.ownKeys(ref).length ||
      Reflect.ownKeys(fields).some((field) => !('value' in Reflect.get(fields, field)))
    )
      return undefined;
    return { value: nativeWeakDeref.call(ref) };
  } catch {
    return undefined;
  }
}
