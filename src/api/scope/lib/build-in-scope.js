/** @flow */
import { loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import { loadScope, Scope } from '../../../scope';
import { ConsumerNotFound } from '../../../consumer/exceptions';
import logger from '../../../logger/logger';

export default function buildInScope({
  id,
  save,
  verbose,
  scopePath,
  directory,
  keep,
  isCI = true
}: {
  id: string,
  save: ?boolean,
  verbose: ?boolean,
  scopePath: string,
  directory: ?string,
  keep: boolean,
  isCI: boolean
}) {
  logger.debug(`buildInScope, id: ${id}, scopePath: ${scopePath}`);
  function loadFromScope(initialError: ?Error) {
    return loadScope(scopePath || process.cwd())
      .catch(newErr => Promise.reject(initialError || newErr))
      .then((scope: Scope) => {
        const bitId = BitId.parse(id);
        return scope.build({ bitId, save, verbose, directory, keep, isCI });
      })
      .catch(e => Promise.reject(e));
  }

  function loadFromConsumer() {
    return loadConsumer().then((consumer) => {
      const bitId = BitId.parse(id);
      return consumer.scope.build({ bitId, save, consumer, verbose });
    });
  }

  if (scopePath) return loadFromScope();

  return loadFromConsumer().catch((err) => {
    if (!(err instanceof ConsumerNotFound)) throw err;
    return loadFromScope(err);
  });
}
