/** @flow */
import { BitId } from '../../../bit-id';
import { loadConsumer } from '../../../consumer';
import Bit from '../../../consumer/component';

export default function importAction(
  { bitId, save, tester, compiler, loader }: {
    bitId: string, save: ?bool, tester: ?bool, compiler: ?bool, loader: any }): Promise<Bit[]> {
  return loadConsumer()
    .then((consumer) => {
      if (tester || compiler) { 
        loader.text = 'importing Environment component';
        loader.start();

        return consumer.importEnvironment(bitId)
        .then((component) => {
          function writeToBitJsonIfNeeded() {
            if (save && compiler) {
              consumer.bitJson.compilerId = bitId;
              return consumer.bitJson.write({ bitDir: consumer.getPath() });
            }

            if (save && tester) {
              consumer.bitJson.testerId = bitId;
              return consumer.bitJson.write({ bitDir: consumer.getPath() });
            }

            return Promise.resolve(true);
          }
          
          return writeToBitJsonIfNeeded()
          .then(() => [component]);
        });
      }
      
      loader.start();
      return consumer.import(bitId)
        .then((bits) => {
          if (save) {
            const parseId = BitId.parse(bitId, consumer.scope.name);
            return consumer.bitJson.addDependency(parseId).write({ bitDir: consumer.getPath() })
            .then(() => bits);
          }

          return Promise.resolve(bits);
        });
    });
}
