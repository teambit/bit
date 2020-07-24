import { loadScope } from '../../../scope';
import { loadConsumerIfExist, loadConsumer } from '../../../consumer';
import logger from '../../../logger/logger';
import { MigrationResult } from '../../../migration/migration-helper';
import { HarmonyMigrator } from '../../../consumer/migrations/harmony-migrator';

/**
 * Running migration process for consumer and / or scope - to update the stores (bitObjects, bit.map.json) to the current version
 *
 * @export
 * @param {string} scopePath - A path to scope directory, it a path was provided the migration won't run on consumer
 * @param {boolean} verbose - print debug logs
 * @returns {Promise<MigrationResult>} - wether the process run and wether it successeded
 */
export default async function migrate(
  scopePath: string,
  verbose: boolean
): Promise<MigrationResult | null | undefined> {
  logger.silly('migrate.migrate, starting migration process');
  if (verbose) console.log('starting migration process'); // eslint-disable-line no-console
  let scope;
  // If a scope path provided we will run the migrate only for the scope
  if (scopePath) {
    logger.silly(`migrate.migrate, running migration process for scope in path ${scopePath}`);
    if (verbose) console.log(`running migration process for scope in path ${scopePath}`); // eslint-disable-line no-console
    scope = await loadScope(scopePath);
    return scope.migrate(verbose);
  }
  // If a scope path was not provided we will run the migrate on the consumer and for the scope
  const consumer = await loadConsumerIfExist();
  if (!consumer) {
    return null;
  }
  scope = consumer.scope;
  await consumer.migrate(verbose);
  // const consumerMigrationResult = await consumer.migrate(verbose);
  // if (!consumerMigrationResult)
  logger.silly('migrate.migrate, running migration process for scope in consumer');
  if (verbose) console.log('running migration process for scope in consumer'); // eslint-disable-line no-console
  return scope.migrate(verbose);
}

export async function migrateToHarmony() {
  const consumer = await loadConsumer();
  const harmonyMigrator = new HarmonyMigrator(consumer);
  const results = harmonyMigrator.migrate();
  await consumer.onDestroy();
  return results;
}
