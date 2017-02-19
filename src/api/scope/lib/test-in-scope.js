/** @flow */
import { loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import { loadScope } from '../../../scope';
import { ConsumerNotFound } from '../../../consumer/exceptions';

export default function testInScope({ id, environment, save, verbose }: {
  id: string, environment?: ?bool, save?: ?bool, verbose?: ?bool }) {
  return loadConsumer()
  .then((consumer) => {
    const bitId = BitId.parse(id, consumer.scope.name);
    return consumer.scope.runComponentSpecs({ bitId, environment, save, consumer, verbose });
  }).catch((err) => {
    if (!(err instanceof ConsumerNotFound)) throw err;
    return loadScope(process.cwd())
      .catch(() => Promise.reject(err))
      .then((scope) => {
        const bitId = BitId.parse(id, scope.name);
        return scope.runComponentSpecs({ bitId, environment, save, verbose });
      })
      .catch(e => Promise.reject(e));
  });
}
