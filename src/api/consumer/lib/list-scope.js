/** @flow */
import { loadConsumer } from '../../../consumer';
import { loadScope } from '../../../scope';
import { ConsumerNotFound } from '../../../consumer/exceptions';
import loader from '../../../cli/loader';
import { BEFORE_REMOTE_LIST } from '../../../cli/loader/loader-messages';

export default function list({ scopeName, cache }: 
{ scopeName: ?string, cache?: bool }): Promise<string[]> {
  return loadConsumer()
  .then((consumer) => {
    const scope = consumer.scope;

    if (scopeName) {
      return scope.remotes()
      .then(remotes =>
        remotes.resolve(scopeName, scope.name)
        .then((remote) => {
          loader.start(BEFORE_REMOTE_LIST);
          return remote.list();
        })
      );
    }

    return cache ? scope.list() : scope.listStage();
  })
  .catch((err) => {
    if (!(err instanceof ConsumerNotFound)) throw err;
    return loadScope(process.cwd())
      .catch(() => Promise.reject(err))
      .then((scope) => { return cache ? scope.list() : scope.listStage(); })
      .catch(e => Promise.reject(e));
  });
}
