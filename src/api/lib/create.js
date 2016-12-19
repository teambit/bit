/** @flow */
import { loadConsumer } from '../../consumer';
import InlineId from '../../bit-inline-id';
import Bit from '../../bit';

export default function create(id: string): Promise<Bit> {
  return loadConsumer()
    .then(consumer =>
      consumer.createBit(InlineId.parse(id))
    );
}
