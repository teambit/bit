/** @flow */
import { loadConsumer } from '../../../consumer';
import { loadScope } from '../../../scope';
import { ConsumerNotFound } from '../../../consumer/exceptions';

export default function list({ scopeName, loader }: 
{ scopeName: ?string, loader: any }): Promise<string[]> {
  return loadConsumer()
  .then((consumer) => {
    const scope = consumer.scope;

    if (scopeName) {
      return scope.remotes()
      .then(remotes =>
        // $FlowFixMe
        remotes.resolve(scopeName, scope.name)
        .then((remote) => {
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
      .then(scope => scope.listStage())
      .catch(e => Promise.reject(err)); // throw the error from the first strategy (about init and not about init --bare)
  });
}
