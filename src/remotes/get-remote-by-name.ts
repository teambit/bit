import { Consumer } from '../consumer';
import { getScopeRemotes } from '../scope/scope-remotes';
import { Remote, Remotes } from '.';

export default async function getRemoteByName(remoteName: string, consumer?: Consumer): Promise<Remote> {
  if (consumer) {
    const remotes: Remotes = await getScopeRemotes(consumer.scope);
    return remotes.resolve(remoteName, consumer.scope);
  }
  return Remotes.getScopeRemote(remoteName);
}
