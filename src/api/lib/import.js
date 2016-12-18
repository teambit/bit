/** @flow */
import { loadConsumer } from '../../consumer';

export default function importAction({ bitId }: { bitId: string }): Promise<any> {
  return loadConsumer()
    .then((consumer) => {
      return consumer.import(bitId)
        .then(bits => 
          Promise.all(
            bits.map(bit => bit.write())
          )
        );
    });
}
