/** @flow */
import includes from 'lodash.includes';
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
    // added this in order to get global auto complete in case the user on write the component name without default namespace
    const bitId = BitId.parse(componentId).toString();
    if (includes(newComponents, bitId)) {
      untrackedComponents.push(bitId);
      consumer.bitMap.removeComponent(bitId);
    } else {
      consumer.bitMap.getComponent(bitId, false) ? unRemovableComponents.push(bitId) : missing.push(bitId);
    }
  });
  await consumer.onDestroy();
  return { untrackedComponents, unRemovableComponents, missingComponents: missing };
});
