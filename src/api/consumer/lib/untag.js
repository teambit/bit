// @flow
import { loadConsumer, Consumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import { removeLocalVersion, removeLocalVersionsForAllComponents } from '../../../scope/component-ops/untag-component';
import type { untagResult } from '../../../scope/component-ops/untag-component';
import GeneralError from '../../../error/general-error';

/**
 * in case the untagged version is the current version in bitmap, update to the latest version
 * or, remove the version completely in case all versions were untagged
 */
function updateBitMap(consumer: Consumer, untagResults: untagResult[]): void {
  untagResults.forEach((result: untagResult) => {
    const { id, versions, component } = result;
    const idStr = id.toString();
    const currentId = consumer.bitMap.getExistingComponentId(idStr);
    if (!currentId) throw new GeneralError(`id ${idStr} is missing from bitmap`);
    const currentBitId = consumer.getBitId(currentId);
    if (currentBitId.hasVersion() && versions.includes(currentBitId.version)) {
      const newId = currentBitId.clone();
      if (!component.versionArray.length) {
        newId.version = null;
      } else {
        newId.version = component.latest();
      }
      consumer.bitMap.updateComponentId(newId);
    }
  });
}

export default (async function unTagAction(version?: string, force: boolean, id?: string): Promise<untagResult[]> {
  const consumer: Consumer = await loadConsumer();
  const untag = async (): Promise<untagResult[]> => {
    if (id) {
      const bitId = consumer.getBitId(id);
      // a user might run the command `bit untag id@version` instead of `bit untag id version`
      if (bitId.hasVersion() && !version) version = bitId.version;
      const result = await removeLocalVersion(consumer.scope, bitId, version, force);
      return [result];
    }
    // untag all
    return removeLocalVersionsForAllComponents(consumer.scope, version, force);
  };
  const results = await untag();
  updateBitMap(consumer, results);
  await consumer.onDestroy();
  return results;
});
