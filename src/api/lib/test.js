/** @flow */
import { loadConsumer } from '../../consumer';
import InlineId from '../../consumer/bit-inline-id';
import Bit from '../../consumer/component';

export default function test(id: string): Promise<Bit> {
  return loadConsumer()
    .then(consumer =>
      consumer.testBit(InlineId.parse(id))
    );
}
