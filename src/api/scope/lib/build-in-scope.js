/** @flow */
import { loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import { loadScope, Scope } from '../../../scope';
import { ConsumerNotFound } from '../../../consumer/exceptions';
import logger from '../../../logger/logger';

export default function buildInScope({ id, environment, save, verbose, scopePath }:
{ id: string, environment: ?bool, save: ?bool, verbose: ?bool, scopePath: string }) {
  logger.debug(`buildInScope, id: ${id}, scopePath: ${scopePath}`);
  function loadFromScope(initialError: ?Error) {
    return loadScope(scopePath || process.cwd())
      .catch(newErr => Promise.reject(initialError || newErr))
      .then((scope: Scope) => {
        const bitId = BitId.parse(id, scope.name);
        return scope.build({ bitId, environment, save, verbose });
      })
      .catch(e => Promise.reject(e));
  }

  function loadFromConsumer() {
    return loadConsumer()
    .then((consumer) => {
      const bitId = BitId.parse(id, consumer.scope.name);
      return consumer.scope.build({ bitId, environment, save, consumer, verbose });
    });
  }

  if (scopePath) return loadFromScope();

  return loadFromConsumer()
    .catch((err) => {
      if (!(err instanceof ConsumerNotFound)) throw err;
      return loadFromScope(err);
    });
}
