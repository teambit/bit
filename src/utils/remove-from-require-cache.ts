// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import Module from 'module';

import filterObject from './filter-object';

// remove any cached module path for a module name (Module._pathCache)
export default function removeFromRequireCache(currentRequestName: string) {
  // @ts-ignore
  Module._pathCache = filterObject(Module._pathCache, (val, key) => {
    const cachedRequestName = JSON.parse(key).request;
    return currentRequestName !== cachedRequestName;
  });
}
