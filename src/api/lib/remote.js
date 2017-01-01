/** @flow */
import { loadScope } from '../../scope';
import { Remote } from '../../remotes';

function buildRemote(url: string): Remote {
  return new Remote(url);
}

export function add(url: string) {
  const remote = buildRemote(url);
  return remote.scope().then((scopeDesc) => {
    return loadScope().then((scope) => {
      remote.name = scopeDesc.name;
      return scope.scopeJson
        .addRemote(remote)
        .write(scope.getPath())
        .then(() => remote);
    });
  });  
}

export function remove(name: string) {
  return loadScope().then((scope) => {
    return scope.scopeJson
      .rmRemote(name)
      .write(scope.getPath())
      .then(() => name);
  });
}

export function list() {
  return loadScope().then((scope) => {
    return scope.remotes();
  });
}

export function refresh() {
  
}
