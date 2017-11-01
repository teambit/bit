/** @flow */
import _ from 'ramda';
import { Repository, Ref, BitObject } from '../objects';
import { BIT_VERSION } from '../../constants';
import migratonManifest from './scope-migrator-manifest';
import getMigrationVersions from '../../migration/migration-helper';

export type ScopeMigrationResult = {
  newObjects: BitObject[],
  objectsToRemove: string[]
};

type VersionMigrationsFunctions = {
  component: ?(Fucntion[]),
  symlink: ?(Fucntion[]),
  scopeMeta: ?(Fucntion[]),
  version: ?(Fucntion[])
};

type VersionMigrations = {
  version: string,
  migrations: VersionMigrationsFunctions
};

export default (async function migrate(
  scopeVersion: string,
  objects: BitObject[],
  verbose: boolean = false
): Promise<ScopeMigrationResult> {
  const migrations: VersionMigrations[] = getMigrationVersions(BIT_VERSION, scopeVersion, migratonManifest, verbose);
  // We loop over the objects and not over the migration because we want to run the process even if there is no migrations at all
  // The reason is that we might change the id calculation of an object without change the model itself.
  // This will cause a change in the hash, so we need to delete the old object and persist the new one
  // We also need to change all the refrences to this object (for example if we change the id of a version model)
  _.forEach(_runAllMigrationForObject(migrations), objects);
});

/**
 * Runs all the migrations for all the versions for a given object
 * @param {VersionMigrations[]} migrations 
 */
const _runAllMigrationForObject = (migrations: VersionMigrations[]): Function => (object) => {
  console.log(object);
};

function _runAllVersionMigrationForObject() {}

function _runOneMigrationForObject() {}

function _addObjectRefsToCache() {}

const getObjectType = (object: BitObject): string => {};
