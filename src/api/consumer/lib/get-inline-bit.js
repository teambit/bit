/** @flow */
import { loadConsumer } from '../../../consumer';
import InlineId from '../../../consumer/bit-inline-id';

export default function getInlineBit({ id }: { id: string }) {
  return loadConsumer()
    .then(consumer => consumer.loadComponent(InlineId.parse(id)));
}
