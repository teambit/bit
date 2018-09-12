/** @flow */
import { loadConsumer } from '../../../consumer';
import { loadScope } from '../../../scope';
import { BitId } from '../../../bit-id';
import loader from '../../../cli/loader';
import { BEFORE_REMOTE_SHOW } from '../../../cli/loader/loader-messages';
import { ScopeNotFound } from '../../../scope/exceptions';
import Remotes from '../../../remotes/remotes';
import Remote from '../../../remotes/remote';
import Component from '../../../consumer/component';

export default function getScopeComponent({
  id,
  allVersions,
  scopePath,
  showRemoteVersions
}: {
  id: string,
  allVersions: ?boolean,
  scopePath: ?string, // used by the api (see /src/api.js)
  showRemoteVersions: ?boolean
}) {
  function loadFromScope() {
    return loadScope(scopePath || process.cwd()).then((scope) => {
      const bitId = BitId.parse(id, true); // user used --remote so we know it has a scope
      if (allVersions) {
        return scope.loadAllVersions(bitId);
      }
      return scope.loadRemoteComponent(bitId);
    });
  }

  const remoteShow = (remote: Remote, bitId: BitId): Promise<?Component> => {
    loader.start(BEFORE_REMOTE_SHOW);
    return remote.show(bitId);
  };

  if (scopePath) {
    return loadFromScope();
  }

  return loadConsumer()
    .then(async (consumer) => {
      const localScopeName = consumer.scope.name;
      const bitId = consumer.getParsedId(id);
      if (!bitId.isLocal(localScopeName)) {
        if (allVersions) {
          return Promise.reject(new Error('cant list all versions of a remote scope'));
        }

        const component = await consumer.scope
          .remotes()
          .then(remotes => remotes.resolve(bitId.scope, consumer.scope).then(remote => remoteShow(remote, bitId)));

        if (showRemoteVersions) {
          await consumer.addRemoteAndLocalVersionsToDependencies(component, false);
        }

        return { component };
      }

      if (allVersions) {
        return consumer.loadAllVersionsOfComponentFromModel(bitId);
      }
      return consumer.scope.loadComponent(bitId);
    })
    .catch(() => {
      // TODO - handle relevant error error
      return loadFromScope();
    })
    .catch((err) => {
      if (err instanceof ScopeNotFound) {
        const bitId = BitId.parse(id, true);
        // $FlowFixMe the scope must be there
        return Remotes.getScopeRemote(bitId.scope)
          .then(remote => remoteShow(remote, bitId))
          .catch(e => Promise.reject(e));
      }
      throw err;
    });
}
