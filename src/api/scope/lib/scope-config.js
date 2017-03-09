import { loadScope } from '../../../scope';

export function set (key: string, value: string): Promise<any> {
  return loadScope()
    .then(scope => {
      scope.scopeJson.set(key,value);
      return scope.scopeJson.write(process.cwd()).then(() => ({ key, value}));
    });
}

export function get (key: string): Promise<string> {
  return loadScope()
    .then(scope => scope.scopeJson.get(key));
}

export function del (key: string): Promise<any> {
  return loadScope()
    .then(scope => {
      scope.scopeJson.del(key);
      return scope.scopeJson.write(process.cwd());
    });
}

export function list (): Promise<any> {
  return loadScope().then(scope => scope.scopeJson.toPlainObject());
}
