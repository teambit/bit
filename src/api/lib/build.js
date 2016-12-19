/** @flow */
import { loadConsumer } from '../../consumer';
import Bit from '../../bit';
import InlineId from '../../bit-inline-id';

export default function build({ id }: { id: string }): Promise<Bit> {
  return loadConsumer()
    .then((consumer) => {
      return consumer.loadBit(InlineId.parse(id))
      .then(bit => bit.build());
    });
}
