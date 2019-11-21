import R from 'ramda';
import BitMap from '../bit-map';
import { BIT_VERSION } from '../../constants';
import getMigrationVersions, { MigrationDeclaration } from '../../migration/migration-helper';
import logger from '../../logger/logger';

export type ConsumerMigrationResult = {
  bitMap: BitMap;
};

type VersionMigrationsDeclarations = {
  bitmap: MigrationDeclaration[] | null | undefined;
};

type VersionMigrations = {
  version: string;
  migrations: VersionMigrationsDeclarations;
};

let globalVerbose: boolean = false;

/**
 * Running migration process for consumer
 * (Currently support only bitmap migration, but might contain other stores in the future)
 * @param {string} bitmapVersion - The current bitmap version
 * @param {Object} migratonManifest - A manifest which define what migrations to run
 * @param {BitMap} bitMap - bit map object
 * @param {boolean} verbose - print logs
 */
export default (async function migrate(
  bitmapVersion: string,
  migratonManifest: Object,
  bitMap: BitMap,
  verbose: boolean = false
): Promise<ConsumerMigrationResult> {
  globalVerbose = verbose;

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const bitMapMigrations: VersionMigrations[] = getMigrationVersions(
    BIT_VERSION,
    bitmapVersion,
    migratonManifest,
    verbose
  );
  const newBitMap = _runAllMigrationsForStore('bitmap', bitMap, bitMapMigrations);
  // Run more migration for other stores (like bit.json)

  const result = { bitMap: newBitMap };

  return result;
});

/**
 * Runs all the migrations for all the versions for store (bit map) file
 * @param {string} storeType - type of store (bitmap / bitjson etc)
 * @param {string} store - store data
 * @param {VersionMigrations[]} migrations
 */
const _runAllMigrationsForStore = (storeType: string, store: BitMap, migrations: VersionMigrations[]): BitMap => {
  // Make sure we got a store
  if (!store) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return null;
  }
  logger.debug(`start updating store ${storeType}`);
  R.forEach(_runAllVersionMigrationsForStore(storeType, store), migrations);
  return store;
};

/**
 * Runs all the the migration in specific version on store
 * @param {string} storeType - type of store (bitmap / bitjson etc)
 * @param {string} store - store data
 */
const _runAllVersionMigrationsForStore = (storeType: string, store: BitMap): Function => (
  migrations: VersionMigrations
): BitMap => {
  const versionNumber = Object.keys(migrations)[0];
  logger.debug(`updating store ${storeType} to version ${versionNumber}`);
  const migrationForStoreType = migrations[versionNumber][storeType];
  // There is no migration for this type of object for this version
  if (!migrationForStoreType) return store;
  R.forEach(_runOneMigrationForStore(storeType, store), migrationForStoreType);
  return store;
};

/**
 * Run specific migration function on a store
 * @param {string} storeType - type of store (bitmap / bitjson etc)
 * @param {string} store - store data
 */
const _runOneMigrationForStore = (storeType: string, store: BitMap): Function => (migration: MigrationDeclaration) => {
  logger.debug(`running migration: ${migration.name} on ${storeType}`);
  if (globalVerbose) console.log(`running migration: ${migration.name} on ${storeType}`);
  try {
    const migratedStore = migration.migrate(store);
    return migratedStore;
  } catch (err) {
    logger.error(`FAILED - running migration: ${migration.name} on ${storeType}`);
    throw err;
  }
};
