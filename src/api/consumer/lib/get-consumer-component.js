/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';
import NothingToCompareTo from './exceptions/nothing-to-compare-to';
import Component from '../../../consumer/component/consumer-component';

export default (async function getConsumerBit({
  id,
  compare,
  allVersions,
  showRemoteVersions
}: {
  id: string,
  compare: boolean,
  allVersions: ?boolean,
  showRemoteVersions: boolean
}): Promise<Component | Component[]> {
  const consumer: Consumer = await loadConsumer();
  const bitId = consumer.getParsedId(id);
  if (allVersions) {
    return consumer.loadAllVersionsOfComponentFromModel(bitId);
  }
  const component = await consumer.loadComponent(bitId); // loads recent component
  if (showRemoteVersions) {
    await consumer.addRemoteAndLocalVersionsToDependencies(component, true);
  }
  if (compare && !component.componentFromModel) {
    throw new NothingToCompareTo(id);
  }
  await consumer.onDestroy();
  return component;
});
