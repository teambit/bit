/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';
import { loadScope, Scope } from '../../../scope';
import { ConsumerNotFound } from '../../../consumer/exceptions';
import loader from '../../../cli/loader';
import { BEFORE_REMOTE_LIST, BEFORE_LOCAL_LIST } from '../../../cli/loader/loader-messages';
import Remotes from '../../../remotes/remotes';
import Remote from '../../../remotes/remote';
import { COMPONENT_ORIGINS } from '../../../constants';

export default function list({
  scopeName,
  showAll, // include nested
  cache,
  showRemoteVersion
}: {
  scopeName?: string,
  showAll?: boolean,
  cache?: boolean,
  showRemoteVersion?: boolean
}): Promise<string[]> {
  const remoteList = (remote: Remote) => {
    loader.start(BEFORE_REMOTE_LIST);
    return remote.list();
  };
  const scopeList = async (scope: Scope, consumer: Consumer) => {
    loader.start(BEFORE_LOCAL_LIST);
    const components = cache ? await scope.list(showRemoteVersion) : await scope.listStage();
    if (consumer) {
      components.forEach((component) => {
        const existingBitMapId = consumer.bitMap.getExistingComponentId(component.id.toStringWithoutVersion(), [
          COMPONENT_ORIGINS.AUTHORED,
          COMPONENT_ORIGINS.IMPORTED
        ]);
        if (existingBitMapId) {
          component.currentlyUsedVersion = existingBitMapId;
          component.componentMap = consumer.bitMap.getComponent(existingBitMapId);
        }
      });
    }
    if (showAll) return components;
    return components.filter(
      component => component.componentMap && component.componentMap.origin !== COMPONENT_ORIGINS.NESTED
    );
  };

  return loadConsumer()
    .then((consumer) => {
      const scope = consumer.scope;

      if (scopeName) {
        return scope.remotes().then(remotes => remotes.resolve(scopeName, scope.name).then(remoteList));
      }

      return scopeList(scope, consumer);
    })
    .catch((err) => {
      if (!(err instanceof ConsumerNotFound)) throw err;

      if (scopeName) {
        return Remotes.getScopeRemote(scopeName).then(remoteList);
      }

      return loadScope(process.cwd())
        .catch(() => Promise.reject(err))
        .then(scopeList)
        .catch(e => Promise.reject(e));
    });
}
