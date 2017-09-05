/** @flow */
import { loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import { loadScope } from '../../../scope';
import { ConsumerNotFound } from '../../../consumer/exceptions';
import logger from '../../../logger/logger';

export default function testInScope({ id, environment, save, verbose, scopePath, directory, keep }: {
  id: string, environment?: ?bool, save?: ?bool, verbose?: ?bool, scopePath: string, directory?: string, keep?: boolean }) {
  logger.debug(`testInScope, id: ${id}, scopePath: ${scopePath}`);
  function loadFromScope(initialError: ?Error) {
    return loadScope(scopePath || process.cwd())
      .catch(newErr => Promise.reject(initialError || newErr))
      .then((scope) => {
        const bitId = BitId.parse(id);
        return scope.runComponentSpecs({
          bitId,
          environment,
          save,
          verbose,
          isolated: true,
          directory,
          keep
        });
      })
      .catch(e => Promise.reject(e));
  }

  function loadFromConsumer() {
    return loadConsumer()
      .then((consumer) => {
        const bitId = BitId.parse(id);
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
