/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';
import { BitId, BitIds } from '../../../bit-id';

export default (async function untrack(componentIds: string[], all: ?boolean): Promise<Object> {
  const untrackedComponents: BitId[] = [];
  const missing: string[] = [];
  const unRemovableComponents: BitId[] = [];
  const consumer: Consumer = await loadConsumer();
  const componentsList = new ComponentsList(consumer);
  // $FlowFixMe
  const newComponents: BitIds = await componentsList.listNewComponents(false);

  if (all) {
    newComponents.forEach(componentId => consumer.bitMap.removeComponent(componentId));
    await consumer.onDestroy();
    return { untrackedComponents: newComponents, unRemovableComponents, missingComponents: missing };
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
});
