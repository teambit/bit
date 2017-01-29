/** @flow */
import { loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';

export default function getScopeBit({ id, loader }: { id: string, loader: any }) {
  return loadConsumer()
    .then((consumer) => {
      const localScopeName = consumer.scope.name;
      const bitId = BitId.parse(id, localScopeName);

      if (!bitId.isLocal(localScopeName)) {
        return consumer.scope.remotes()
        .then(remotes => 
          remotes.resolve(bitId.scope, consumer.scope)
          .then((remote) => {
            loader.start();
            return remote.show(bitId);
          })
        );
      }
      
      return consumer.scope.loadComponent(bitId);
    });
}
