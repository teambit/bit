/** @flow */
import includes from 'lodash.includes';
import R from 'ramda';
import BitMap from '../../../consumer/bit-map';
import { loadConsumer, Consumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';
import { BitId } from '../../../bit-id';

export default (async function untrack(componentIds: string[]): Promise<Object> {
  const untrackedComponents = [];
  const missing = [];
  const unRemovableComponents = [];
  const consumer: Consumer = await loadConsumer();
  const bitMap = await BitMap.load(consumer.getPath());
  const componentsList = new ComponentsList(consumer);
  const newComponents = await componentsList.listNewComponents(false);

  if (R.isEmpty(componentIds)) {
    newComponents.forEach(componentId => bitMap.removeComponent(componentId));
    await bitMap.write();
    return { untrackedComponents: newComponents, unRemovableComponents, missingComponents: missing };
  }
  componentIds.forEach((componentId) => {
    // added this in order to get global auto complete in case the user on write the component name without default namespace
    const bitId = BitId.parse(componentId).toString();
    if (includes(newComponents, bitId)) {
      untrackedComponents.push(bitId);
      bitMap.removeComponent(bitId);
    } else {
      bitMap.getComponent(bitId, false) ? unRemovableComponents.push(bitId) : missing.push(bitId);
    }
  });
  await bitMap.write();
  return { untrackedComponents, unRemovableComponents, missingComponents: missing };
});
