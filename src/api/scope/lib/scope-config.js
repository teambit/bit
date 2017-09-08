// @flow
import { loadScope } from '../../../scope';

function set(key: string, value: string): Promise<any> {
  return loadScope().then((scope) => {
    scope.scopeJson.set(key, value);
    return scope.scopeJson.write(process.cwd()).then(() => ({ key, value }));
  });
}

function get(key: string): Promise<string> {
  return loadScope().then(scope => scope.scopeJson.get(key));
}

function del(key: string): Promise<any> {
  return loadScope().then((scope) => {
    scope.scopeJson.del(key);
    return scope.scopeJson.write(process.cwd());
  });
}

function list(): Promise<any> {
  return loadScope().then(scope => scope.scopeJson.toPlainObject());
}

module.exports = { set, get, del, list };
