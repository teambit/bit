/** @flow */
import { loadConsumer } from '../../consumer';
import Bit from '../../bit';

export default function importAction(
  { bitId, save, env }: { bitId: string, save: bool, env: bool }): Promise<Bit[]> {
  return loadConsumer()
    .then((consumer) => {
      if (env) { return consumer.importEnvironment(bitId).then(bit => [bit]); }
      return consumer.import(bitId) 
      // @TODO - write bitId on bitJson if the variabel "save" is true
        .then(bits => Promise.all(bits.map(bit => bit.write())));
    });
}
