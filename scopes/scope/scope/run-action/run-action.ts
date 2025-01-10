import { loadScope, Scope } from '@teambit/legacy.scope';
import { getScopeRemotes } from '@teambit/scope.remotes';

export async function runAction(actionName: string, remote: string, options = {}): Promise<any> {
  const scope: Scope = await loadScope();
  const scopeRemotes = await getScopeRemotes(scope);
  const remoteObj = await scopeRemotes.resolve(remote);
  return remoteObj.action(actionName, options);
}
