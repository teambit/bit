/** @flow */
import { loadConsumer } from '../../../consumer';
import { loadScope } from '../../../scope';
import { BitId } from '../../../bit-id';
import loader from '../../../cli/loader';
import { BEFORE_REMOTE_SHOW } from '../../../cli/loader/loader-messages';
import { ScopeNotFound } from '../../../scope/exceptions';
import Remotes from '../../../remotes/remotes';
import { GlobalRemotes } from '../../../global-config';

export default function getScopeBit({ id, allVersions, scopePath }:
{ id: string, allVersions: ?bool, scopePath: ?string }) {
  function loadFromScope() {
    return loadScope(scopePath || process.cwd())
      .then((scope) => {
        const localScopeName = scope.name;
        const bitId = BitId.parse(id, localScopeName);
        if (allVersions) { return scope.loadAllVersions(bitId); }
        return scope.loadComponent(bitId);
      });
  }

  const remoteShow = (remote, bitId) => {
    loader.start(BEFORE_REMOTE_SHOW);
    return remote.show(bitId);
  };

  if (scopePath) { return loadFromScope(); }

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
          .then((remote) => remoteShow(remote, bitId))
        );
      }

      if (allVersions) { return consumer.scope.loadAllVersions(bitId); }
      return consumer.scope.loadComponent(bitId);
    }).catch((err) => { // TODO - handle relevant error error
      return loadFromScope();
    }).catch((err) => {
      if (err instanceof ScopeNotFound) {
        const bitId = BitId.parse(id);
        return Remotes.getScopeRemote(bitId.scope)
          .then((remote) => remoteShow(remote, bitId))
          .catch(e => Promise.reject(e));
      }
      throw err;
    });
}
