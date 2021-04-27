import { loadScope, Scope } from '../../../scope';
import { getScopeRemotes } from '../../../scope/scope-remotes';

export async function runAction(actionName: string, remote: string, options = {}): Promise<any> {
  const scope: Scope = await loadScope();
  const scopeRemotes = await getScopeRemotes(scope);
  const remoteObj = await scopeRemotes.resolve(remote, scope);
  return remoteObj.action(actionName, options);
}
