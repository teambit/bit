/** @flow */
import { loadConsumer } from '../../../consumer';
import { loadScope } from '../../../scope';
import { ConsumerNotFound } from '../../../consumer/exceptions';
import loader from '../../../cli/loader';
import { BEFORE_REMOTE_LIST } from '../../../cli/loader/loader-messages';
import Remotes from '../../../remotes/remotes';

export default function list({
  scopeName,
  cache,
  all
}: {
  scopeName?: string,
  cache?: boolean,
  all?: boolean
}): Promise<string[]> {
  const remoteList = (remote) => {
    loader.start(BEFORE_REMOTE_LIST);
    return remote.list(all);
  };
  const scopeList = (scope) => {
    return cache ? scope.list() : scope.listStage(all);
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
