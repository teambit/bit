/** @flow */
import { loadConsumer } from '../../consumer';
import InlineId from '../../bit-inline-id';

export default function getBit({ id }: { id: string }) {
  return loadConsumer()
    .then(consumer => consumer.loadBit(InlineId.parse(id)));
}
