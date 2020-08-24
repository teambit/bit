import R from 'ramda';

import { BitId } from '../../../bit-id';
import loader from '../../../cli/loader';
import { BEFORE_LOCAL_LIST, BEFORE_REMOTE_LIST } from '../../../cli/loader/loader-messages';
import { Consumer, loadConsumerIfExist } from '../../../consumer';
import ComponentsList, { ListScopeResult } from '../../../consumer/component/components-list';
import { ConsumerNotFound } from '../../../consumer/exceptions';
import GeneralError from '../../../error/general-error';
import getRemoteByName from '../../../remotes/get-remote-by-name';
import Remote from '../../../remotes/remote';
import { SSHConnectionStrategyName } from '../../../scope/network/ssh/ssh';
import NoIdMatchWildcard from './exceptions/no-id-match-wildcard';

export async function listScope({
  scopeName,
  showAll, // include nested
  showRemoteVersion,
  namespacesUsingWildcards,
  strategiesNames,
}: {
  scopeName?: string;
  showAll?: boolean;
  showRemoteVersion?: boolean;
  namespacesUsingWildcards?: string;
  strategiesNames?: SSHConnectionStrategyName[];
}): Promise<ListScopeResult[]> {
  const consumer: Consumer | undefined = await loadConsumerIfExist();
  if (scopeName) {
    return remoteList();
  }
  return scopeList();

  async function remoteList(): Promise<ListScopeResult[]> {
    const remote: Remote = await getRemoteByName(scopeName as string, consumer);
    loader.start(BEFORE_REMOTE_LIST);
    return remote.list(namespacesUsingWildcards, strategiesNames);
  }

  async function scopeList(): Promise<ListScopeResult[]> {
    if (!consumer) {
      throw new ConsumerNotFound();
    }
    loader.start(BEFORE_LOCAL_LIST);
    const componentsList = new ComponentsList(consumer);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return componentsList.listScope(showRemoteVersion, showAll, namespacesUsingWildcards);
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
  return listResult.map((result) => result.id);
}
