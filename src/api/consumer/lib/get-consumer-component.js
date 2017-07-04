/** @flow */
import { loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';

export default function getConsumerBit({ id }: { id: string }) {
  return loadConsumer()
    .then(consumer => consumer.loadComponent(BitId.parse(id)));
}
