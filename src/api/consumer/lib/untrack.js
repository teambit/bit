/** @flow */
import R from 'ramda';
import { loadConsumer, Consumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';
import { BitId } from '../../../bit-id';

export default (async function untrack(componentIds: string[], all: ?boolean): Promise<Object> {
  const untrackedComponents = [];
  const missing = [];
  const unRemovableComponents = [];
  const consumer: Consumer = await loadConsumer();
  const componentsList = new ComponentsList(consumer);
  const newComponents = await componentsList.listNewComponents(false);

  if (all) {
    newComponents.forEach(componentId => consumer.bitMap.removeComponent(componentId));
    await consumer.onDestroy();
    return { untrackedComponents: newComponents, unRemovableComponents, missingComponents: missing };
  }
  componentIds.forEach((componentId) => {
    const bitId = consumer.getBitIdIfExist(componentId);
    if (!bitId) {
      missing.push(bitId);
      return;
    }
    if (newComponents.includes(bitId)) {
      untrackedComponents.push(bitId);
      consumer.bitMap.removeComponent(bitId);
    } else {
      unRemovableComponents.push(bitId);
    }
  });
  await consumer.onDestroy();
  return { untrackedComponents, unRemovableComponents, missingComponents: missing };
});
