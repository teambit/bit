/** @flow */
import { loadConsumer } from '../../../consumer';
import type Consumer from '../../../consumer/consumer';
import { loadScope, Scope } from '../../../scope';
import { ConsumerNotFound } from '../../../consumer/exceptions';
import logger from '../../../logger/logger';

export default function buildInScope({
  id,
  save,
  verbose,
  scopePath,
  directory,
  keep
}: {
  id: string,
  save: ?boolean,
  verbose: ?boolean,
  scopePath: string,
  directory: ?string,
  keep: boolean
}) {
  logger.debugAndAddBreadCrumb('buildInScope', 'id: {id}, scopePath: {scopePath}', { id, scopePath });
  async function loadFromScope(initialError: ?Error) {
    const getScope = async () => {
      try {
        const scope = await loadScope(scopePath || process.cwd());
        return scope;
      } catch (err) {
        throw new Error(initialError || err);
      }
    };
    const scope: Scope = await getScope();
    const bitId = await scope.getParsedId(id);
    return scope.build({ bitId, save, verbose, directory, keep });
  }

  function loadFromConsumer() {
    return loadConsumer().then((consumer: Consumer) => {
      const bitId = consumer.getParsedId(id);
      return consumer.scope.build({ bitId, save, consumer, verbose });
    });
  }

  if (scopePath) return loadFromScope();

  return loadFromConsumer().catch((err) => {
    if (!(err instanceof ConsumerNotFound)) throw err;
    return loadFromScope(err);
  });
}
