/** @flow */
import { loadConsumer } from '../../consumer';
import InlineId from '../../bit-inline-id';

export default function create(id: string): Promise<boolean> {
  return loadConsumer()
    .then(consumer =>
      consumer.createBit(InlineId.parse(id))
    );
}
