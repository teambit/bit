/** @flow */
import { loadConsumer } from '../../../consumer';
import { loadScope } from '../../../scope';
import { ConsumerNotFound } from '../../../consumer/exceptions';
import loader from '../../../cli/loader';

export default function list({ scopeName }: 
{ scopeName: ?string }): Promise<string[]> {
  return loadConsumer()
  .then((consumer) => {
    const scope = consumer.scope;

    if (scopeName) {
      return scope.remotes()
      .then(remotes =>
        remotes.resolve(scopeName, scope.name)
        .then((remote) => {
          loader.setText('listing remote components');
          loader.start();
          return remote.list();
        })
      );
    }

    return scope.listStage();
  })
  .catch((err) => {
    if (!(err instanceof ConsumerNotFound)) throw err;
    return loadScope(process.cwd())
      .catch(() => Promise.reject(err))
      .then(scope => scope.listStage())
      .catch(e => Promise.reject(e));
  });
}
