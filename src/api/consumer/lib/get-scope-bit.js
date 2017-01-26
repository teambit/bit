/** @flow */
import { loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';

export default function getScopeBit({ id }: { id: string }) {
  return loadConsumer()
    .then((consumer) => {
      const localScopeName = consumer.scope.name;
      const bitId = BitId.parse(id, localScopeName);

      if (!bitId.isLocal(localScopeName)) {
        return consumer.scope.remotes()
        .then(remotes => 
          remotes.resolve(bitId.scope, consumer.scope)
          .then(remote => remote.show(bitId))
        );
      }
      
      return consumer.scope.loadComponent(bitId);
    });
}
