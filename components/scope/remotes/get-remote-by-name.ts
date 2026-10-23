import type { Scope } from '@teambit/legacy.scope';
import { getScopeRemotes } from './scope-remotes';
import type { Remote } from './remote';
import { Remotes } from './remotes';

/**
 * `consumer` is the legacy Consumer when running in a workspace; only its scope is read.
 */
export async function getRemoteByName(remoteName: string, consumer?: { scope: Scope }): Promise<Remote> {
  if (consumer) {
    const remotes: Remotes = await getScopeRemotes(consumer.scope);
    return remotes.resolve(remoteName);
  }
  return Remotes.getScopeRemote(remoteName);
}
