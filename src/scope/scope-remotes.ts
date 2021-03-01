import R from 'ramda';

import { BitId } from '../bit-id';
import GlobalRemotes from '../global-config/global-remotes';
import { Remotes } from '../remotes';
import { Scope } from '.';

export async function getScopeRemotes(scope: Scope): Promise<Remotes> {
  const globalRemotes = await GlobalRemotes.load();
  const globalObj = globalRemotes.toPlainObject();
  return Remotes.load(R.merge(globalObj, scope.scopeJson.remotes), scope);
}

export async function fetchRemoteVersions(scope: Scope, componentIds: BitId[]): Promise<BitId[]> {
  const externals = componentIds.filter((id) => !id.isLocal(scope.name));
  const remotes = await getScopeRemotes(scope);
  return remotes.latestVersions(externals, scope);
}
