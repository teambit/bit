import R from 'ramda';

import { BitId } from '../bit-id';
import GlobalRemotes from '../global-config/global-remotes';
import { Remotes } from '../remotes';
import { Scope } from '.';

export function getScopeRemotes(scope: Scope): Promise<Remotes> {
  function mergeRemotes(globalRemotes: GlobalRemotes) {
    const globalObj = globalRemotes.toPlainObject();
    return Remotes.load(R.merge(globalObj, scope.scopeJson.remotes));
  }

  return GlobalRemotes.load().then(mergeRemotes);
}

export async function fetchRemoteVersions(scope: Scope, componentIds: BitId[]): Promise<BitId[]> {
  const externals = componentIds.filter((id) => !id.isLocal(scope.name));
  const remotes = await getScopeRemotes(scope);
  return remotes.latestVersions(externals, scope);
}
