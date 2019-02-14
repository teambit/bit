// @flow
import { loadConsumer, Consumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import {
  removeLocalVersion,
  removeLocalVersionsForAllComponents,
  removeLocalVersionsForComponentsMatchedByWildcard
} from '../../../scope/component-ops/untag-component';
import type { untagResult } from '../../../scope/component-ops/untag-component';
import hasWildcard from '../../../utils/string/has-wildcard';

/**
 * in case the untagged version is the current version in bitmap, update to the latest version
 * or, remove the version completely in case all versions were untagged
 */
function updateBitMap(consumer: Consumer, untagResults: untagResult[]): void {
  untagResults.forEach((result: untagResult) => {
    const { id, versions, component } = result;
    const currentId: BitId = consumer.bitMap.getBitId(id, { ignoreVersion: true });
    if (currentId.hasVersion() && versions.includes(currentId.version)) {
      const newVersion = component.versionArray.length ? component.latest() : null;
      const newId = currentId.changeVersion(newVersion);
      consumer.bitMap.updateComponentId(newId);
    }
  });
}

export default (async function unTagAction(version?: string, force: boolean, id?: string): Promise<untagResult[]> {
  const consumer: Consumer = await loadConsumer();
  const untag = async (): Promise<untagResult[]> => {
    const idHasWildcard = hasWildcard(id);
    if (idHasWildcard) {
      return removeLocalVersionsForComponentsMatchedByWildcard(consumer.scope, version, force, id);
    }
    if (id) {
      const bitId = consumer.getParsedId(id);
      // a user might run the command `bit untag id@version` instead of `bit untag id version`
      if (bitId.hasVersion() && !version) version = bitId.version;
      const result = await removeLocalVersion(consumer.scope, bitId, version, force);
      return [result];
    }
    // untag all
    return removeLocalVersionsForAllComponents(consumer.scope, version, force);
  };
  const results = await untag();
  await consumer.scope.objects.persist();
  updateBitMap(consumer, results);
  await consumer.onDestroy();
  return results;
});
