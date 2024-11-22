import { Consumer } from '@teambit/legacy/dist/consumer';
import { getScopeRemotes } from './scope-remotes';
import { Remote } from './remote';
import { Remotes } from './remotes';

export async function getRemoteByName(remoteName: string, consumer?: Consumer): Promise<Remote> {
  if (consumer) {
    const remotes: Remotes = await getScopeRemotes(consumer.scope);
    return remotes.resolve(remoteName, consumer.scope);
  }
  return Remotes.getScopeRemote(remoteName);
}
