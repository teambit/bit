import { BitId, BitIds } from '../../../bit-id';
import { Consumer, loadConsumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';
import hasWildcard from '../../../utils/string/has-wildcard';

export default async function untrack(
  componentIds: string[],
  all: boolean | null | undefined
): Promise<Record<string, any>> {
  const untrackedComponents: BitId[] = [];
  const missing: string[] = [];
  const unRemovableComponents: BitId[] = [];
  const consumer: Consumer = await loadConsumer();
  const componentsList = new ComponentsList(consumer);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const newComponents: BitIds = await componentsList.listNewComponents(false);
  const idsHaveWildcard = hasWildcard(componentIds);
  if (all || idsHaveWildcard) {
    const componentsToUntrack = hasWildcard(componentIds)
      ? ComponentsList.filterComponentsByWildcard(newComponents, componentIds)
      : newComponents;
    componentsToUntrack.forEach((componentId) => consumer.bitMap.removeComponent(componentId));
    await consumer.onDestroy();
    return { untrackedComponents: componentsToUntrack, unRemovableComponents, missingComponents: missing };
  }
  componentIds.forEach((componentId) => {
    const bitId = consumer.getParsedIdIfExist(componentId);
    if (!bitId) {
      missing.push(componentId);
      return;
    }
    if (newComponents.has(bitId)) {
      untrackedComponents.push(bitId);
      consumer.bitMap.removeComponent(bitId);
    } else {
      unRemovableComponents.push(bitId);
    }
  });
  await consumer.onDestroy();
  return { untrackedComponents, unRemovableComponents, missingComponents: missing };
}
