/** @flow */
import { loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import { loadScope } from '../../../scope';
import { ConsumerNotFound } from '../../../consumer/exceptions';
import logger from '../../../logger/logger';
import SpecsResults from '../../../consumer/specs-results';

export default function testInScope({
  id,
  save,
  verbose, // gets called during CI, verbose is always true
  scopePath,
  directory,
  keep
}: {
  id: string,
  save?: ?boolean,
  verbose?: ?boolean,
  scopePath: string,
  directory?: string,
  keep?: boolean
}): Promise<?SpecsResults> {
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
          keep
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
        isolated: true
      });
    });
  }

  if (scopePath) return loadFromScope();

  return loadFromConsumer().catch((err) => {
    if (!(err instanceof ConsumerNotFound)) throw err;
    return loadFromScope(err);
  });
}
