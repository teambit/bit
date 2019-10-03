/** @flow */
import R from 'ramda';
import { loadConsumerIfExist, Consumer } from '../../../consumer';
import loader from '../../../cli/loader';
import { BEFORE_REMOTE_LIST, BEFORE_LOCAL_LIST } from '../../../cli/loader/loader-messages';
import Remote from '../../../remotes/remote';
import ComponentsList from '../../../consumer/component/components-list';
import { ListScopeResult } from '../../../consumer/component/components-list';
import { getScopeRemotes } from '../../../scope/scope-remotes';
import { Remotes } from '../../../remotes';
import { ConsumerNotFound } from '../../../consumer/exceptions';
import GeneralError from '../../../error/general-error';
import { BitId } from '../../../bit-id';
import NoIdMatchWildcard from './exceptions/no-id-match-wildcard';
import { SSHConnectionStrategyName } from '../../../scope/network/ssh/ssh';

export async function listScope({
  scopeName,
  showAll, // include nested
  showRemoteVersion,
  namespacesUsingWildcards,
  strategiesNames
}: {
  scopeName?: string,
  showAll?: boolean,
  showRemoteVersion?: boolean,
  namespacesUsingWildcards?: string,
  strategiesNames?: SSHConnectionStrategyName[]
}): Promise<ListScopeResult[]> {
  const consumer: Consumer | null | undefined = await loadConsumerIfExist();
  if (scopeName) {
    return remoteList();
  }
  return scopeList();

  async function remoteList(): Promise<ListScopeResult[]> {
    const remote: Remote = await _getRemote();
    loader.start(BEFORE_REMOTE_LIST);
    return remote.list(namespacesUsingWildcards, strategiesNames);
  }

  async function scopeList(): Promise<ListScopeResult[]> {
    if (!consumer) {
      throw new ConsumerNotFound();
    }
    loader.start(BEFORE_LOCAL_LIST);
    const componentsList = new ComponentsList(consumer);
    return componentsList.listScope(showRemoteVersion, showAll, namespacesUsingWildcards);
  }

  async function _getRemote(): Promise<Remote> {
    if (consumer) {
      const remotes = await getScopeRemotes(consumer.scope);
      return remotes.resolve(scopeName, consumer.scope);
    }
    return Remotes.getScopeRemote(scopeName);
  }
}

export async function getRemoteBitIdsByWildcards(idStr: string): Promise<BitId[]> {
  if (!idStr.includes('/')) {
    throw new GeneralError(
      `import with wildcards expects full scope-name before the wildcards, instead, got "${idStr}"`
    );
  }
  const idSplit = idStr.split('/');
  const scopeName = idSplit[0];
  const namespacesUsingWildcards = R.tail(idSplit).join('/');
  const listResult = await listScope({ scopeName, namespacesUsingWildcards });
  if (!listResult.length) {
    throw new NoIdMatchWildcard([idStr]);
  }
  return listResult.map(result => result.id);
}
