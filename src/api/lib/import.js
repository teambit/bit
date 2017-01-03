/** @flow */
import { loadConsumer } from '../../consumer';
import Bit from '../../bit';

export default function importAction(
  { bitId, save, env }: { bitId: string, save: bool, env: bool }): Promise<Bit[]> {
  return loadConsumer()
    .then((consumer) => {
      return consumer.import(bitId, env) 
      // @TODO - write bitId on bitJson if the variabel "save" is true
        .then(bits =>
          Promise.all(bits.map(bit => bit.write())
        ));
    });
}
