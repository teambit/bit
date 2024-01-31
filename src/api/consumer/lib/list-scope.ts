import R from 'ramda';
import { BitError } from '@teambit/bit-error';
import { ComponentID } from '@teambit/component-id';
import loader from '../../../cli/loader';
import { BEFORE_LOCAL_LIST, BEFORE_REMOTE_LIST } from '../../../cli/loader/loader-messages';
import { Consumer, loadConsumerIfExist } from '../../../consumer';
import ComponentsList, { ListScopeResult } from '../../../consumer/component/components-list';
import { ConsumerNotFound } from '../../../consumer/exceptions';
import getRemoteByName from '../../../remotes/get-remote-by-name';
import Remote from '../../../remotes/remote';
import NoIdMatchWildcard from './exceptions/no-id-match-wildcard';

export async function listScope({
  scopeName,
  showAll = false, // include nested
  showRemoteVersion = false,
  namespacesUsingWildcards,
}: {
  scopeName?: string;
  showAll?: boolean;
  showRemoteVersion?: boolean;
  namespacesUsingWildcards?: string;
}): Promise<ListScopeResult[]> {
  const consumer: Consumer | undefined = await loadConsumerIfExist();
  if (scopeName) {
    return remoteList();
  }
  return localList();

  async function remoteList(): Promise<ListScopeResult[]> {
    const remote: Remote = await getRemoteByName(scopeName as string, consumer);
    loader.start(BEFORE_REMOTE_LIST);
    return remote.list(`${scopeName}/${namespacesUsingWildcards}`);
  }

  async function localList(): Promise<ListScopeResult[]> {
    if (!consumer) {
      throw new ConsumerNotFound();
    }
    loader.start(BEFORE_LOCAL_LIST);
    const componentsList = new ComponentsList(consumer);
    return componentsList.listAll(showRemoteVersion, showAll, namespacesUsingWildcards);
  }
}

export async function getRemoteBitIdsByWildcards(idStr: string, includeDeprecated = true): Promise<ComponentID[]> {
  if (!idStr.includes('/')) {
    throw new BitError(`import with wildcards expects full scope-name before the wildcards, instead, got "${idStr}"`);
  }
  const idSplit = idStr.split('/');
  const scopeName = idSplit[0];
  const namespacesUsingWildcards = R.tail(idSplit).join('/');
  const listResult = await listScope({ scopeName, namespacesUsingWildcards });
  const listResultFiltered = includeDeprecated ? listResult : listResult.filter((r) => !r.deprecated);
  if (!listResultFiltered.length) {
    throw new NoIdMatchWildcard([idStr]);
  }
  return listResultFiltered.map((result) => result.id);
}
