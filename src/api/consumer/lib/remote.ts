import GeneralError from '../../../error/general-error';
import { GlobalRemotes } from '../../../global-config';
import { Remote } from '../../../remotes';
import { loadScope } from '../../../scope';
import { getScopeRemotes } from '../../../scope/scope-remotes';

function buildRemote(url: string): Remote {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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

    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return loadScope().then((scope) => {
      return scope.scopeJson
        .addRemote(remote)
        .write(scope.getPath())
        .then(() => remote);
    });
  });
}

export async function remove(name: string, global: boolean) {
  if (global) {
    const globalRemotes = await GlobalRemotes.load();
    const hasRemoved = globalRemotes.rmRemote(name);
    if (!hasRemoved) {
      throw new GeneralError(
        `remote "${name}" was not found globally, to remove a local remote, please omit the "--global" flag`
      );
    }
    await globalRemotes.write();
    return name;
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const scope = await loadScope();
  const hasRemoved = scope.scopeJson.rmRemote(name);
  if (!hasRemoved) {
    throw new GeneralError(
      `remote "${name}" was not found locally, to remove a global remote, please use "--global" flag`
    );
  }
  await scope.scopeJson.write(scope.getPath());
  return name;
}

export function list(global: boolean) {
  if (global) {
    return GlobalRemotes.load().then((globalRemotes) => globalRemotes.toPlainObject());
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return loadScope().then((scope) => {
    return getScopeRemotes(scope).then((remotes) => remotes.toPlainObject());
  });
}

export function refresh() {}
