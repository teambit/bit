/** @flow */
import { loadConsumer } from '../../../consumer';
import { loadScope } from '../../../scope';
import { BitId } from '../../../bit-id';

export default function getScopeBit({ id, loader, allVersions }: 
{ id: string, loader: any, allVersions: ?bool }) {
  return loadConsumer()
    .then((consumer) => {
      const localScopeName = consumer.scope.name;
      const bitId = BitId.parse(id, localScopeName);
      if (!bitId.isLocal(localScopeName)) {
        if (allVersions) {
          return Promise.reject(new Error('cant list all versions of a remote scope'));
        }

        return consumer.scope.remotes()
        .then(remotes => 
          remotes.resolve(bitId.scope, consumer.scope)
          .then((remote) => {
            loader.start();
            return remote.show(bitId);
          })
        );
      }
      
      if (allVersions) { return consumer.scope.loadAllVersions(bitId); }
      return consumer.scope.loadComponent(bitId);
    }).catch((err) => { // TODO - handle relevant error error
      return loadScope(process.cwd())
        .then((scope) => {
          const localScopeName = scope.name;
          const bitId = BitId.parse(id, localScopeName);
          if (allVersions) { return scope.loadAllVersions(bitId); }
          return scope.loadComponent(bitId);
        });
    });
}
