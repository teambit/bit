/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';
import { Scope } from '../../../scope';
import loader from '../../../cli/loader';
import { BEFORE_REMOTE_LIST, BEFORE_LOCAL_LIST } from '../../../cli/loader/loader-messages';
import Remote from '../../../remotes/remote';
import ComponentsList from '../../../consumer/component/components-list';
import type { ListScopeResult } from '../../../consumer/component/components-list';
import { getScopeRemotes } from '../../../scope/scope-remotes';

export default (async function list({
  scopeName,
  showAll, // include nested
  showRemoteVersion,
  namespacesUsingWildcards
}: {
  scopeName?: string,
  showAll: boolean,
  showRemoteVersion: boolean,
  namespacesUsingWildcards?: string
}): Promise<ListScopeResult[]> {
  const consumer: Consumer = await loadConsumer();
  const scope: Scope = consumer.scope;
  if (scopeName) {
    const remotes = await getScopeRemotes(scope);
    const remote: Remote = await remotes.resolve(scopeName, scope);
    return remoteList(remote, namespacesUsingWildcards);
  }

  return scopeList(consumer, showAll, showRemoteVersion);
});

function remoteList(remote: Remote, namespacesUsingWildcards?: string): Promise<ListScopeResult[]> {
  loader.start(BEFORE_REMOTE_LIST);
  return remote.list(namespacesUsingWildcards);
}

async function scopeList(consumer: Consumer, showAll: boolean, showRemoteVersion: boolean): Promise<ListScopeResult[]> {
  loader.start(BEFORE_LOCAL_LIST);
  const componentsList = new ComponentsList(consumer);
  return componentsList.listScope(showRemoteVersion, showAll);
}
