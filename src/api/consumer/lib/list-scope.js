/** @flow */
import { loadConsumer } from '../../../consumer';
import { loadScope } from '../../../scope';

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
  }).catch((err) => {
    return loadScope(process.cwd())
      .then(scope => scope.listStage());
  });
}
