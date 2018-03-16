// @flow
import { loadConsumer, Consumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import { removeLocalVersion, removeLocalVersionsForAllComponents } from '../../../scope/component-ops/untag-component';
import type { untagResult } from '../../../scope/component-ops/untag-component';

/**
 * in case the untagged version is the current version in bitmap, update to the latest version
 * or, remove the version completely in case all versions were untagged
 */
async function updateBitMap(consumer: Consumer, untagResults: untagResult[]): Promise<void> {
  untagResults.forEach((result: untagResult) => {
    const { id, versions, component } = result;
    const idStr = id.toString();
    const currentId = consumer.bitMap.getExistingComponentId(idStr);
    if (!currentId) throw new Error(`id ${idStr} is missing from bitmap`);
    const currentBitId = BitId.parse(currentId);
    if (currentBitId.hasVersion() && versions.includes(currentBitId.version)) {
      const newId = currentBitId.clone();
      if (!component.versionArray.length) {
        newId.version = null;
      } else {
        newId.version = component.latest();
      }
      consumer.bitMap.updateComponentId(newId);
      consumer.bitMap.hasChanged = true;
    }
  });
  if (consumer.bitMap.hasChanged) await consumer.bitMap.write();
}

export default (async function unTagAction(version?: string, force: boolean, id?: string): Promise<untagResult[]> {
  const consumer: Consumer = await loadConsumer();
  const untag = async (): Promise<untagResult[]> => {
    if (id) {
      const bitId = BitId.parse(id);
      // a user might run the command `bit untag id@version` instead of `bit untag id version`
      if (bitId.hasVersion() && !version) version = bitId.version;
      const result = await removeLocalVersion(consumer.scope, bitId, version, force);
      return [result];
    }
    // untag all
    return removeLocalVersionsForAllComponents(consumer.scope, version, force);
  };
  const results = await untag();
  await updateBitMap(consumer, results);
  return results;
});
