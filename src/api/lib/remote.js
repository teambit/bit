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

export function remove() {

}

export function list() {

}

export function refresh() {
  
}
