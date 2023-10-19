import { ComponentID } from '@teambit/component-id';
import GlobalRemotes from '../global-config/global-remotes';
import { Remotes } from '../remotes';
import { Scope } from '.';

export async function getScopeRemotes(scope: Scope): Promise<Remotes> {
  const globalRemotes = await GlobalRemotes.load();
  const globalObj = globalRemotes.toPlainObject();
  return Remotes.load({ ...globalObj, ...scope.scopeJson.remotes }, scope);
}

export async function fetchRemoteVersions(scope: Scope, componentIds: ComponentID[]): Promise<ComponentID[]> {
  const externals = componentIds.filter((id) => !scope.isLocal(id));
  const remotes = await getScopeRemotes(scope);
  return remotes.latestVersions(externals, scope);
}
