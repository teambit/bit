/** @flow */
import { loadConsumer } from '../../../consumer';
import { loadScope, Scope } from '../../../scope';
import { ConsumerNotFound } from '../../../consumer/exceptions';
import loader from '../../../cli/loader';
import { BEFORE_REMOTE_LIST } from '../../../cli/loader/loader-messages';
import Remotes from '../../../remotes/remotes';
import Remote from '../../../remotes/remote';

export default function list({
  scopeName,
  cache,
  showRemoteVersion
}: {
  scopeName?: string,
  cache?: boolean,
  showRemoteVersion?: boolean
}): Promise<string[]> {
  const remoteList = (remote: Remote) => {
    loader.start(BEFORE_REMOTE_LIST);
    return remote.list();
  };
  const scopeList = (scope: Scope) => {
    return cache ? scope.list(showRemoteVersion) : scope.listStage();
  };

  return loadConsumer()
    .then((consumer) => {
      const scope = consumer.scope;

      if (scopeName) {
        return scope.remotes().then(remotes => remotes.resolve(scopeName, scope.name).then(remoteList));
      }

      return scopeList(scope);
    })
    .catch((err) => {
      if (!(err instanceof ConsumerNotFound)) throw err;

      if (scopeName) {
        return Remotes.getScopeRemote(scopeName).then(remoteList);
      }

      return loadScope(process.cwd())
        .catch(() => Promise.reject(err))
        .then(scopeList)
        .catch(e => Promise.reject(e));
    });
}
