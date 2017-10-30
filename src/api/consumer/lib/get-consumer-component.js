/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import NothingToCompareTo from './exceptions/nothing-to-compare-to';

export default (async function getConsumerBit({
  id,
  compare,
  showRemoteVersions
}: {
  id: string,
  compare: boolean,
  showRemoteVersions: boolean
}) {
  const consumer: Consumer = await loadConsumer();
  const bitId = BitId.parse(id);
  const component = await consumer.loadComponent(bitId); // loads recent component
  if (showRemoteVersions) {
    await consumer.addRemoteAndLocalVersionsToDependencies(component, true);
  }
  if (compare) {
    try {
      const componentModel = await consumer.scope.loadComponent(bitId);
      return { component, componentModel };
    } catch (err) {
      throw new NothingToCompareTo(id);
    }
  }
  return { component };
});
