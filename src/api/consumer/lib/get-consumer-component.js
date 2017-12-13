/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
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
  const bitId = BitId.parse(id);
  if (allVersions) {
    return consumer.scope.loadAllVersions(bitId);
  }
  const component = await consumer.loadComponent(bitId); // loads recent component
  if (showRemoteVersions) {
    await consumer.addRemoteAndLocalVersionsToDependencies(component, true);
  }
  if (compare) {
    try {
      const componentModel = await consumer.scope.loadRemoteComponent(component.id);
      const bitMap = await consumer.getBitMap();
      componentModel.stripOriginallySharedDir(bitMap);
      return { component, componentModel };
    } catch (err) {
      throw new NothingToCompareTo(id);
    }
  }
  return { component };
});
