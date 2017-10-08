/** @flow */
import { loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';

export default (async function getConsumerBit({ id, compare }: { id: string, compare: boolean }) {
  const consumer = await loadConsumer();
  const component = await consumer.loadComponent(BitId.parse(id)); // loads recent component
  if (compare) {
    const modelComponent = await consumer.scope.loadComponent(BitId.parse(id));
    return { component, modelComponent };
  }
  return { component };
});
