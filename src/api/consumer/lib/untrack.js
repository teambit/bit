/** @flow */
import includes from 'lodash.includes';
import R from 'ramda';
import BitMap from '../../../consumer/bit-map';
import { loadConsumer, Consumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';

export default async function untrack(componentIds: string[]): Promise<Object> {
  const untrackedComponents = [];
  let missing = [],
    unRemovableComponents = [];
  const consumer: Consumer = await loadConsumer();
  const bitMap = await BitMap.load(consumer.getPath());
  const componentsList = new ComponentsList(consumer);
  const newComponents = (await componentsList.listNewComponents(true)).map(componentId => componentId.id.toString());

  if (R.isEmpty(componentIds)) {
    newComponents.forEach(componentId => bitMap.removeComponent(componentId));
    await bitMap.write();
    return { untrackedComponents: newComponents, unRemovableComponents, missingComponents: missing };
  }
  componentIds.forEach((componentId) => {
    if (includes(newComponents, componentId)) {
      untrackedComponents.push(componentId);
      bitMap.removeComponent(componentId);
    } else {
      bitMap.getComponent(componentId, false) ? unRemovableComponents.push(componentId) : missing.push(componentId);
    }
  });
  await bitMap.write();
  return { untrackedComponents, unRemovableComponents, missingComponents: missing };
}
