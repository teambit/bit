/** @flow */
import semver from 'semver';
import logger from '../logger/logger';

export type MigrationResult = {
  run: boolean,
  success: ?boolean
};

export type MigrationDeclaration = {
  name: string,
  migrate: Fucntion
};

type AbstractVersionMigrations = {
  version: string,
  migrations: MigrationDeclaration[]
};

/**
 * A function which get a migration manifest and versions, and return a sorted array of the migrations to run
 * We are taking also the current version to prevent cases which a developer specify a migration to run for a future release, and we don't want it
 * to run now
 * 
 * @export
 * @param {string} currentVersion - The current version of bit
 * @param {string} storeVersion  - The version of the store to check (for example scope version or .bit.map.json version)
 * @param {Object} migratonManifest  - A manifest which contain all the existing migrations
 * @param {boolean} [verbose=false] - Print logs
 * @returns {Object[]} - Sorted array of migrations to run
 */
export default function getMigrationVersions(
  currentVersion: string,
  storeVersion: string,
  migratonManifest: Object,
  verbose: boolean = false
): AbstractVersionMigrations[] {
  if (currentVersion === storeVersion) return [];
  // Get all the versions which contain at least one migration
  const migrationsVersions = Object.keys(migratonManifest);
  // Get migration versions which is between the current version and the store version
  const migrationsVersionsToRun = migrationsVersions.filter(version =>
    semver.satisfies(version, `>${storeVersion} <=${currentVersion}`)
  );
  // Sort the migration to run them from the oldest version to the newest (in case i update my client and there is few versions in between with
  // migration process)
  const sortedMigrationVersionsToRun = migrationsVersionsToRun.sort(semver.compare);
  // Get the result with the actual functions
  const sortedMigrationToRun = sortedMigrationVersionsToRun.map(migrationVersion => ({
    [migrationVersion]: migratonManifest[migrationVersion]
  }));
  logger.debug(`Found the following versions which need migration ${sortedMigrationVersionsToRun.join(', ')}`);
  if (verbose) {
    console.log(`Found the following versions which need migration ${sortedMigrationVersionsToRun.join(', ')}`); // eslint-disable-line no-console
  }
  return sortedMigrationToRun;
}
