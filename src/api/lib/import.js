/** @flow */
import { loadConsumer } from '../../consumer';
import Bit from '../../bit';

export default function importAction({ bitId }: { bitId: string }): Promise<Bit[]> {
  return loadConsumer()
    .then((consumer) => {
      return consumer.import(bitId)
        .then((bits) => {
          // @TODO  - verify that import from @this is working
          console.log(bits);
          return Promise.all(
            bits.map(bit => bit.write()
          ));
        });
    });
}
