/** @flow */
import { loadScope, Scope } from '../../../scope';
import { BitId } from '../../../bit-id';
import loader from '../../../cli/loader';
import { BEFORE_REMOTE_SHOW } from '../../../cli/loader/loader-messages';
import { ScopeNotFound } from '../../../scope/exceptions';
import Remotes from '../../../remotes/remotes';
import Remote from '../../../remotes/remote';
import Component from '../../../consumer/component';
import { loadConsumer, Consumer } from '../../../consumer';
import { getScopeRemotes } from '../../../scope/scope-remotes';
import ScopeComponentsImporter from '../../../scope/component-ops/scope-components-importer';

export default (async function getScopeComponent({
  id,
  allVersions,
  scopePath
}: {
  id: string,
  allVersions: ?boolean,
  scopePath: ?string // used by the api (see /src/api.js)
}): Promise<Component[] | Component> {
  const bitId: BitId = BitId.parse(id, true); // user used --remote so we know it has a scope
  const remoteShow = async (remote: Remote): Promise<?Component> => {
    loader.start(BEFORE_REMOTE_SHOW);
    return remote.show(bitId);
  };
  const getConsumer = async (): Promise<?Consumer> => {
    try {
      const consumer: Consumer = await loadConsumer();
      return consumer;
    } catch (err) {
      return null;
    }
  };
  const getScope = async (): Promise<?Scope> => {
    try {
      const scope = await loadScope(scopePath || process.cwd());
      return scope;
    } catch (err) {
      if (err instanceof ScopeNotFound) return null;
      throw err;
    }
  };
  const showComponentUsingConsumer = async (consumer: Consumer) => {
    if (allVersions) {
      return Promise.reject(new Error('cant list all versions of a remote scope'));
    }
    const remotes: Remotes = await getScopeRemotes(consumer.scope);
    // $FlowFixMe scope must be set as it came from a remote
    const remote = await remotes.resolve(bitId.scope, consumer.scope);
    return remoteShow(remote);
  };
  const showComponentUsingScope = async (scope: Scope) => {
    if (allVersions) {
      return scope.loadAllVersions(bitId);
    }
    const scopeComponentsImporter = ScopeComponentsImporter.getInstance(scope);
    return scopeComponentsImporter.loadRemoteComponent(bitId);
  };

  if (!scopePath) {
    const consumer: ?Consumer = await getConsumer();
    if (consumer) {
      return showComponentUsingConsumer(consumer);
    }
  }

  const scope: ?Scope = await getScope();
  if (scope) {
    return showComponentUsingScope(scope);
  }

  // $FlowFixMe the scope must be there
  const remote = await Remotes.getScopeRemote(bitId.scope);
  return remoteShow(remote);
});
