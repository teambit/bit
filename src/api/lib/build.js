/** @flow */
import { loadConsumer } from '../../consumer';
import Bit from '../../consumer/bit';
import InlineId from '../../consumer/bit-inline-id';

export default function build({ id }: { id: string }): Promise<Bit> {
  return loadConsumer()
    .then((consumer) => {
      return consumer.loadBit(InlineId.parse(id))
      .then((bit) => { 
        if (!bit.hasCompiler()) throw new Error('there is no compiler for bit'); // @TODO - write an named error
        return bit.build(consumer.scope);
      });
    });
}
