/** @flow */
import { loadConsumer } from '../../consumer';
import Bit from '../../bit';

export default function importAction({ bitId }: { bitId: string }): Promise<Bit[]> {
  return loadConsumer()
    .then((consumer) => {
      return consumer.import(bitId)
        .then(bits =>
          Promise.all(bits.map(bit => bit.write())
        ));
    });
}
