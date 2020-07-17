import { loadConsumer, Consumer } from '../../../consumer';
import {
  removeLocalVersion,
  removeLocalVersionsForAllComponents,
  removeLocalVersionsForComponentsMatchedByWildcard,
} from '../../../scope/component-ops/untag-component';
import { untagResult } from '../../../scope/component-ops/untag-component';
import hasWildcard from '../../../utils/string/has-wildcard';

export default (async function unTagAction(version?: string, force?: boolean, id?: string): Promise<untagResult[]> {
  const consumer: Consumer = await loadConsumer();
  const untag = async (): Promise<untagResult[]> => {
    const idHasWildcard = hasWildcard(id);
    if (idHasWildcard) {
      return removeLocalVersionsForComponentsMatchedByWildcard(consumer.scope, version, force, id);
    }
    if (id) {
      const bitId = consumer.getParsedId(id);
      // a user might run the command `bit untag id@version` instead of `bit untag id version`
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      if (bitId.hasVersion() && !version) version = bitId.version;
      const result = await removeLocalVersion(consumer.scope, bitId, version, force);
      return [result];
    }
    // untag all
    return removeLocalVersionsForAllComponents(consumer.scope, version, force);
  };
  const results = await untag();
  await consumer.scope.objects.persist();
  const components = results.map((result) => result.component);
  await consumer.updateComponentsVersions(components);
  await consumer.onDestroy();
  return results;
});
