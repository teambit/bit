/** @flow */
import { loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import { loadScope } from '../../../scope';
import { ConsumerNotFound } from '../../../consumer/exceptions';
import logger from '../../../logger/logger';

export default function testInScope({
  id,
  save,
  verbose,
  scopePath,
  directory,
  keep,
  isCI = true
}: {
  id: string,
  save?: ?boolean,
  verbose?: ?boolean,
  scopePath: string,
  directory?: string,
  keep?: boolean,
  isCI?: boolean
}) {
  logger.debug(`testInScope, id: ${id}, scopePath: ${scopePath}`);
  function loadFromScope(initialError: ?Error) {
    return loadScope(scopePath || process.cwd())
      .catch(newErr => Promise.reject(initialError || newErr))
      .then((scope) => {
        const bitId = BitId.parse(id);
        return scope.runComponentSpecs({
          bitId,
          save,
          verbose,
          isolated: true,
          directory,
          keep,
          isCI
        });
      })
      .catch(e => Promise.reject(e));
  }

  function loadFromConsumer() {
    return loadConsumer().then((consumer) => {
      const bitId = BitId.parse(id);
      return consumer.scope.runComponentSpecs({
        consumer,
        bitId,
        save,
        verbose,
        isolated: true,
        isCI
      });
    });
  }

  if (scopePath) return loadFromScope();

  return loadFromConsumer().catch((err) => {
    if (!(err instanceof ConsumerNotFound)) throw err;
    return loadFromScope(err);
  });
}
