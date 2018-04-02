/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';
import { loadScope, Scope } from '../../../scope';
import { ConsumerNotFound } from '../../../consumer/exceptions';
import loader from '../../../cli/loader';
import { BEFORE_REMOTE_LIST } from '../../../cli/loader/loader-messages';
import Remotes from '../../../remotes/remotes';
import Remote from '../../../remotes/remote';

export default function list({
  scopeName,
  cache,
  showRemoteVersion
}: {
  scopeName?: string,
  cache?: boolean,
  showRemoteVersion?: boolean
}): Promise<string[]> {
  const remoteList = (remote: Remote) => {
    loader.start(BEFORE_REMOTE_LIST);
    return remote.list();
  };
  const scopeList = async (scope: Scope, consumer: Consumer) => {
    const components = cache ? await scope.list(showRemoteVersion) : await scope.listStage();
    if (consumer) {
      components.forEach((component) => {
        component.currentlyUsedVersion = consumer.bitMap.getExistingComponentId(component.id.toStringWithoutVersion());
      });
    }
    return components;
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
