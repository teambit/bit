/** @flow */
import { loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';

export default function getScopeBit({ id }: { id: string }) {
  return loadConsumer()
    .then(consumer => consumer.scope.loadComponent(BitId.parse(id)));
}
