import { loadConsumer } from '../../../consumer';
import Consumer from '../../../consumer/consumer';
import { ConsumerNotFound } from '../../../consumer/exceptions';
import logger from '../../../logger/logger';
import { loadScope, Scope } from '../../../scope';

export default function buildInScope({
  id,
  save,
  verbose,
  scopePath,
  directory,
  keep,
  noCache = false,
}: {
  id: string;
  save?: boolean;
  verbose?: boolean;
  scopePath?: string;
  directory?: string;
  keep: boolean;
  noCache: boolean;
}) {
  logger.debugAndAddBreadCrumb('buildInScope', 'id: {id}, scopePath: {scopePath}', { id, scopePath });
  async function loadFromScope(initialError: Error | null | undefined) {
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
    return scope.build({ bitId, save, verbose, directory, keep, noCache });
  }

  function loadFromConsumer() {
    return loadConsumer().then((consumer: Consumer) => {
      const bitId = consumer.getParsedId(id);
      return consumer.scope.build({ bitId, save, consumer, verbose });
    });
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (scopePath) return loadFromScope();

  return loadFromConsumer().catch((err) => {
    if (!(err instanceof ConsumerNotFound)) throw err;
    return loadFromScope(err);
  });
}
