/** @flow */
import { loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import { loadScope, Scope } from '../../../scope';
import { ConsumerNotFound } from '../../../consumer/exceptions';
import logger from '../../../logger/logger';

export default function packInScope({
  id,
  scopePath,
  directory,
  writeBitDependencies,
  links,
  override
}: {
  id: string,
  scopePath: string,
  directory: string,
  writeBitDependencies: boolean,
  links: boolean,
  override: boolean
}) {
  logger.debug(`buildInScope, id: ${id}, scopePath: ${scopePath}`);
  function loadFromScope(initialError: ?Error) {
    return loadScope(scopePath || process.cwd())
      .catch(newErr => Promise.reject(initialError || newErr))
      .then((scope: Scope) => {
        const bitId = BitId.parse(id);
        return scope.pack({ bitId, directory, writeBitDependencies, links, override });
      })
      .catch(e => Promise.reject(e));
  }

  function loadFromConsumer() {
    return loadConsumer().then((consumer) => {
      const bitId = BitId.parse(id);
      return consumer.scope.pack({ bitId, directory, writeBitDependencies, links, override });
    });
  }

  if (scopePath) return loadFromScope();

  return loadFromConsumer().catch((err) => {
    if (!(err instanceof ConsumerNotFound)) throw err;
    return loadFromScope(err);
  });
}
