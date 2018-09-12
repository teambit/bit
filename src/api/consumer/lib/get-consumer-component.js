/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';
import NothingToCompareTo from './exceptions/nothing-to-compare-to';

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
}) {
  const consumer: Consumer = await loadConsumer();
  const bitId = consumer.getParsedId(id);
  if (allVersions) {
    return consumer.loadAllVersionsOfComponentFromModel(bitId);
  }
  const component = await consumer.loadComponent(bitId); // loads recent component
  if (showRemoteVersions) {
    await consumer.addRemoteAndLocalVersionsToDependencies(component, true);
  }
  if (compare) {
    if (!component.componentFromModel) throw new NothingToCompareTo(id);
    return { component, componentModel: component.componentFromModel };
  }
  await consumer.onDestroy();
  return { component };
});
