/** @flow */
import { loadConsumer } from '../../../consumer';
import { loadScope } from '../../../scope';
import { ConsumerNotFound } from '../../../consumer/exceptions';
import loader from '../../../cli/loader';
import { BEFORE_REMOTE_LIST } from '../../../cli/loader/loader-messages';
import Remotes from '../../../remotes/remotes';

export default function list({ scopeName, cache }:
{ scopeName?: string, cache?: bool }): Promise<string[]> {

  const remoteList = (remote) => {
    loader.start(BEFORE_REMOTE_LIST);
    return remote.list();
  };
  const scopeList = (scope) => cache ? scope.list() : scope.listStage();

  if (Remotes.isHub(scopeName)) {
    // $FlowFixMe
    return Remotes.resolveHub(scopeName).then(remoteList);
  }

  return loadConsumer()
  .then((consumer) => {
    const scope = consumer.scope;

    if (scopeName) {
      return scope.remotes()
      .then(remotes =>
        remotes.resolve(scopeName, scope.name)
        .then(remoteList)
      );
    }

    return scopeList(scope);
  })
  .catch((err) => {
    if (!(err instanceof ConsumerNotFound)) throw err;
    return loadScope(process.cwd())
      .catch(() => Promise.reject(err))
      .then(scopeList)
      .catch(e => Promise.reject(e));
  });
}
