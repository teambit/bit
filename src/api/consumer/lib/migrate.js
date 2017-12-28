/** @flow */
import { loadScope } from '../../../scope';
import { loadConsumer } from '../../../consumer';
import logger from '../../../logger/logger';
import { MigrationResult } from '../../../migration/migration-helper';

/**
 * Running migration process for consumer and / or scope - to update the stores (bitObjects, bit.map.json) to the current version
 *
 * @export
 * @param {string} scopePath - A path to scope directory, it a path was provided the migration won't run on consumer
 * @param {boolean} verbose - print debug logs
 * @returns {Promise<MigrationResult>} - wether the process run and wether it successeded
 */
export default (async function migrate(scopePath: string, verbose: boolean): Promise<MigrationResult> {
  logger.debug('starting migration process');
  if (verbose) console.log('starting migration process'); // eslint-disable-line no-console
  let scope;
  // If a scope path provided we will run the migrate only for the scope
  if (scopePath) {
    logger.debug(`running migration process for scope in path ${scopePath}`);
    if (verbose) console.log(`running migration process for scope in path ${scopePath}`); // eslint-disable-line no-console
    scope = await loadScope(scopePath);
    return scope.migrate(verbose);
  }
  // If a scope path was not provided we will run the migrate on the consumer and for the scope
  const consumer = await loadConsumer();
  scope = consumer.scope;
  await consumer.migrate(verbose);
  // const consumerMigrationResult = await consumer.migrate(verbose);
  // if (!consumerMigrationResult)
  logger.debug('running migration process for scope in consumer');
  if (verbose) console.log('running migration process for scope in consumer'); // eslint-disable-line no-console
  return scope.migrate(verbose);
});
