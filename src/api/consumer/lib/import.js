/** @flow */
import { BitId } from '../../../bit-id';
import { loadConsumer } from '../../../consumer';
import Bit from '../../../consumer/component';

export default function importAction(
  { bitId, save, tester, compiler }: {
    bitId: string, save: ?bool, tester: ?bool, compiler: ?bool }): Promise<Bit[]> {
  return loadConsumer()
    .then((consumer) => {
      if (tester || compiler) { 
        return consumer.importEnvironment(bitId)
        .then(() => {
          if (save && compiler) {
            consumer.bitJson.compilerId = bitId;
            return consumer.bitJson.write({ bitDir: consumer.getPath() });
          }
          if (save && tester) {
            consumer.bitJson.testerId = bitId;
            return consumer.bitJson.write({ bitDir: consumer.getPath() });
          }
          return Promise.resolve();
        })
        .then(bit => [bit]);
      }
      
      return consumer.import(bitId)
        .then((bits) => {
          if (save) {
            const parseId = BitId.parse(bitId);
            return consumer.bitJson.addDependency(parseId).write({ bitDir: consumer.getPath() })
            .then(() => bits);
          }

          return Promise.resolve(bits);
        });
      // @TODO - write bitId on bitJson if the variabel "save" is true
    });
}
