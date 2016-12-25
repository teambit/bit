/** @flow */
import { loadConsumer } from '../../consumer';
import InlineId from '../../bit-inline-id';
import Bit from '../../bit';

export default function test(id: string): Promise<Bit> {
  return loadConsumer()
    .then(consumer =>
      consumer.testBit(InlineId.parse(id))
    );
}
