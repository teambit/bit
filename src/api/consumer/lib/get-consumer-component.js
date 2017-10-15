/** @flow */
import { loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import NothingToCompareTo from './exceptions/nothing-to-compare-to';

export default (async function getConsumerBit({ id, compare }: { id: string, compare: boolean }) {
  const consumer = await loadConsumer();
  const bitId = BitId.parse(id);
  const component = await consumer.loadComponent(bitId); // loads recent component
  if (compare) {
    try {
      const moduleComponent = await consumer.scope.loadComponent(bitId);
      return { component, moduleComponent };
    } catch (err) {
      throw new NothingToCompareTo(id);
    }
  }
  return { component };
});
