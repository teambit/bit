/** @flow */
import { loadScope } from '../../../scope';
import { Remote } from '../../../remotes';
import { GlobalRemotes } from '../../../global-config';

function buildRemote(url: string): Remote {
  return new Remote(url);
}

export function add(url: string, global: boolean) {
  const remote = buildRemote(url);
  return remote.scope().then((scopeDesc) => {
    remote.name = scopeDesc.name;

    if (global) {
      return GlobalRemotes.load().then((globalRemotes) => {
        return globalRemotes
          .addRemote(remote)
          .write()
          .then(() => remote);
      });
    }

    return loadScope().then((scope) => {
      return scope.scopeJson
        .addRemote(remote)
        .write(scope.getPath())
        .then(() => remote);
    });
  });
}

export function remove(name: string, global: boolean) {
  if (global) {
    return GlobalRemotes.load().then((globalRemotes) => {
      return globalRemotes
        .rmRemote(name)
        .write()
        .then(() => name);
    });
  }

  return loadScope().then((scope) => {
    return scope.scopeJson
      .rmRemote(name)
      .write(scope.getPath())
      .then(() => name);
  });
}

export function list(global: boolean) {
  if (global) {
    return GlobalRemotes.load().then(globalRemotes => globalRemotes.toPlainObject());
  }

  return loadScope().then((scope) => {
    return scope.remotes().then(remotes => remotes.toPlainObject());
  });
}

export function refresh() {}
