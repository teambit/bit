/** @flow */
import { loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import { loadScope } from '../../../scope';
import { ConsumerNotFound } from '../../../consumer/exceptions';

export default function testInScope({ id, environment, save, verbose, scopePath }: {
  id: string, environment?: ?bool, save?: ?bool, verbose?: ?bool, scopePath: string }) {
  function loadFromScope(initialError: ?Error) {
    return loadScope(scopePath || process.cwd())
      .catch(newErr => Promise.reject(initialError || newErr))
      .then((scope) => {
        const bitId = BitId.parse(id, scope.name);
        return scope.runComponentSpecs({
          bitId,
          environment,
          save,
          verbose,
          isolated: true,
        });
      })
      .catch(e => Promise.reject(e));
  }

  function loadFromConsumer() {
    return loadConsumer()
      .then((consumer) => {
        const bitId = BitId.parse(id, consumer.scope.name);
        return consumer.scope.runComponentSpecs({
          consumer,
          bitId,
          environment,
          save,
          verbose,
          isolated: true,
        });
      });
  }

  if (scopePath) return loadFromScope();

  return loadFromConsumer()
    .catch((err) => {
      if (!(err instanceof ConsumerNotFound)) throw err;
      return loadFromScope(err);
    });
}
