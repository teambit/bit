/** @flow */
import R from 'ramda';
import { BitObject, BitRawObject } from '../objects';
import { BIT_VERSION } from '../../constants';
import migratonManifest from './scope-migrator-manifest';
import getMigrationVersions, { MigrationDeclaration } from '../../migration/migration-helper';
import logger from '../../logger/logger';

export type ScopeMigrationResult = {
  newObjects: BitObject[],
  objectsToRemove: string[]
};

type VersionMigrationsDeclarations = {
  component: ?(MigrationDeclaration[]),
  symlink: ?(MigrationDeclaration[]),
  scopeMeta: ?(MigrationDeclaration[]),
  version: ?(MigrationDeclaration[])
};

type VersionMigrations = {
  version: string,
  migrations: VersionMigrationsDeclarations
};

let globalVerbose: boolean = false;

export default (async function migrate(
  scopeVersion: string,
  objects: BitRawObject[],
  verbose: boolean = false
): Promise<ScopeMigrationResult> {
  globalVerbose = verbose;
  const migrations: VersionMigrations[] = getMigrationVersions(BIT_VERSION, scopeVersion, migratonManifest, verbose);
  // We loop over the objects and not over the migration because we want to run the process even if there is no migrations at all
  // The reason is that we might change the id calculation of an object without change the model itself.
  // This will cause a change in the hash, so we need to delete the old object and persist the new one
  // We also need to change all the refrences to this object (for example if we change the id of a version model)
  R.forEach(_runAllMigrationsForObject(migrations), objects);
});

/**
 * Runs all the migrations for all the versions for a given object
 * @param {VersionMigrations[]} migrations
 */
const _runAllMigrationsForObject = (migrations: VersionMigrations[]): Function => (rawObject: BitRawObject) => {
  logger.debug(`start updating object ${rawObject.ref} (${rawObject.id})`);
  return R.forEach(_runAllVersionMigrationsForObject(rawObject), migrations);
};

const _runAllVersionMigrationsForObject = (rawObject: BitRawObject): Function => (migrations: VersionMigrations) => {
  const versionNumber = Object.keys(migrations)[0];
  logger.debug(`updating object ${rawObject.ref} (${rawObject.id}) to version ${versionNumber}`);
  const migrationForObjectType = migrations[versionNumber][rawObject.type];
  // There is no migration for this type of object for this version
  if (!migrationForObjectType) return rawObject;
  return R.forEach(_runOneMigrationForObject(rawObject), migrationForObjectType);
};

const _runOneMigrationForObject = (rawObject: BitRawObject): Function => (migration: MigrationDeclaration) => {
  logger.debug(`running migration: ${migration.name} on object ${rawObject.ref} (${rawObject.id})`);
  if (globalVerbose) console.log(`running migration: ${migration.name}`);
  const migratedContent = migration.migrate(rawObject.getParsedContent());
  return migratedContent;
};

function _addObjectRefsToCache() {}
