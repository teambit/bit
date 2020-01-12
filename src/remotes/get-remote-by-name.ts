import { Consumer } from '../consumer';
import { Remotes } from '.';
import { getScopeRemotes } from '../scope/scope-remotes';

export default async function getRemoteByName(remoteName: string, consumer: Consumer | null) {
  if (consumer) {
    const remotes: Remotes = await getScopeRemotes(consumer.scope);
    return remotes.resolve(remoteName, consumer.scope);
  }
  return Remotes.getScopeRemote(remoteName);
}
