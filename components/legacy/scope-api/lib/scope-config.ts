import { loadScope } from '@teambit/legacy.scope';

export function set(key: string, value: string): Promise<any> {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return loadScope().then((scope) => {
    scope.scopeJson.set(key, value);
    return scope.scopeJson.write(process.cwd()).then(() => ({ key, value }));
  });
}

export function get(key: string): Promise<string> {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return loadScope().then((scope) => scope.scopeJson.get(key));
}

export function del(key: string): Promise<any> {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return loadScope().then((scope) => {
    scope.scopeJson.del(key);
    return scope.scopeJson.write(process.cwd());
  });
}

export function list(): Promise<any> {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return loadScope().then((scope) => scope.scopeJson.toPlainObject());
}
