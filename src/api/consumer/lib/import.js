/** @flow */
import path from 'path';
import { BitId } from '../../../bit-id';
import Bit from '../../../consumer/component';
import Consumer from '../../../consumer/consumer';

export default function importAction(
  { bitId, save, tester, compiler, loader, verbose, prefix, dev }: {
    bitId: string,
    save: ?bool,
    tester: ?bool,
    compiler: ?bool,
    loader: any,
    verbose: ?bool,
    prefix: ?string,
    dev: ?bool,
  }): Promise<Bit[]> {
  const performOnDir = prefix ? path.resolve(prefix) : process.cwd();
  return Consumer.ensure(performOnDir)
    .then(consumer => consumer.scope.ensureDir().then(() => consumer))
    .then((consumer) => {
      if (tester || compiler) { 
        loader.text = 'importing environment dependencies...';
        loader.start();

        return consumer.importEnvironment(bitId, verbose, loader)
        .then((components) => {
          function writeToBitJsonIfNeeded() {
            if (save && compiler) {
              consumer.bitJson.compilerId = components[0].id.toString();
              return consumer.bitJson.write({ bitDir: consumer.getPath() });
            }

            if (save && tester) {
              consumer.bitJson.testerId = components[0].id.toString();
              return consumer.bitJson.write({ bitDir: consumer.getPath() });
            }

            return Promise.resolve(true);
          }
          
          return writeToBitJsonIfNeeded()
          .then(() => components);
        });
      }
      
      return consumer.import(bitId, verbose, loader, dev)
        .then((components) => {
          if (save) {
            const parseId = BitId.parse(bitId, consumer.scope.name);
            return consumer.bitJson.addDependency(parseId).write({ bitDir: consumer.getPath() })
            .then(() => components);
          }

          return Promise.resolve(components);
        });
    });
}
