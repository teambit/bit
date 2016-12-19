/** @flow */
import { loadConsumer } from '../../consumer';
import Bit from '../../bit';
import InlineId from '../../bit-inline-id';

export default function build({ id }: { id: string }): Promise<Bit> {
  if (false) { // external case
    // @TODO write for scope
  }

  return loadConsumer()
    .then(consumer =>
      consumer.loadBit(InlineId.parse(id))
      .then(bit => bit.build())
    );
}
