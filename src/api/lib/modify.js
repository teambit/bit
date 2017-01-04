/** @flow */
import * as pathLib from 'path';
import { loadConsumer } from '../../consumer';
import { BitId } from '../../bit-id';

export default function modify(rawId: string) {
  const bitId = BitId.parse(rawId);
  return loadConsumer()
    .then(consumer => consumer.scope.getOne(bitId)
      .then((bit) => {
        const inlinePath = pathLib.join(consumer.getInlineBitsPath(), bit.getBox(), bit.getName());
        return bit.cd(inlinePath).write()
        .then((b) => {
          consumer.scope.ensureEnvironment(b.bitJson)
          .then(() => b);
        });
      })
    );
}
