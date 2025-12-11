import type { Consumer } from '@teambit/legacy.consumer';
import { getScopeRemotes } from './scope-remotes';
import type { Remote } from './remote';
import { Remotes } from './remotes';

export async function getRemoteByName(remoteName: string, consumer?: Consumer): Promise<Remote> {
  if (consumer) {
    const remotes: Remotes = await getScopeRemotes(consumer.scope);
    return remotes.resolve(remoteName);
  }
  return Remotes.getScopeRemote(remoteName);
}
