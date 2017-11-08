/** @flow */
import R from 'ramda';
import { BitObject, BitRawObject, Ref } from '../objects';
import { BIT_VERSION } from '../../constants';
import getMigrationVersions, { MigrationDeclaration } from '../../migration/migration-helper';
import logger from '../../logger/logger';

export type ScopeMigrationResult = {
  newObjects: BitObject[],
  refsToRemove: Ref[]
};

type ScopeMigrationResultCache = {
  newObjects: { id: string, object: BitObject[] },
  refsToRemove: Ref[]
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
const refsIndex = {};

/**
 * Running migration process for scope 
 * @param {string} scopeVersion - The current scope version
 * @param {Object} migratonManifest - A manifest which define what migrations to run
 * @param {BitRawObject} objects - Scope's raw objects
 * @param {boolean} verbose - print logs
 */
export default (async function migrate(
  scopeVersion: string,
  migratonManifest: Object,
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

  const result = { newObjects: {}, refsToRemove: [] };

  R.forEach(_getRealObjectWithUpdatedRefs(result, refsIndex), objects);
  result.newObjects = R.values(result.newObjects);
  return result;
});

/**
 * Runs all the migrations for all the versions for a given object
 * @param {VersionMigrations[]} migrations
 */
const _runAllMigrationsForObject = (migrations: VersionMigrations[]): Function => (rawObject: BitRawObject) => {
  logger.debug(`start updating object ${rawObject.ref} (${rawObject.id})`);
  // Skip Source files since we don't want the migration to run over them
  if (rawObject.type === 'Source') return null;
  // Add refs to index
  _addObjectRefsToIndex(refsIndex, rawObject);
  return R.forEach(_runAllVersionMigrationsForObject(rawObject), migrations);
};

/**
 * Runs all the the migration in specific version on object
 * @param {BitRawObject} rawObject - object to run migration on
 */
const _runAllVersionMigrationsForObject = (rawObject: BitRawObject): Function => (migrations: VersionMigrations) => {
  const versionNumber = Object.keys(migrations)[0];
  logger.debug(`updating object ${rawObject.ref} (${rawObject.id}) to version ${versionNumber}`);
  const migrationForObjectType = migrations[versionNumber][rawObject.type];
  // There is no migration for this type of object for this version
  if (!migrationForObjectType) return rawObject;
  return R.forEach(_runOneMigrationForObject(rawObject), migrationForObjectType);
};

/**
 * Run specific migration function on an object
 * @param {BitRawObject} rawObject 
 */
const _runOneMigrationForObject = (rawObject: BitRawObject): Function => (migration: MigrationDeclaration) => {
  logger.debug(`running migration: ${migration.name} on object ${rawObject.ref} (${rawObject.id})`);
  if (globalVerbose) console.log(`running migration: ${migration.name} on object ${rawObject.ref} (${rawObject.id})`);
  console.log(rawObject.ref, rawObject.getParsedContent());
  try {
    const migratedContent = migration.migrate(rawObject.getParsedContent());
    rawObject.parsedContent = migratedContent;
    return migratedContent;
  } catch (err) {
    logger.info(`FAILED - running migration: ${migration.name} on object ${rawObject.ref} (${rawObject.id})`);
    throw err;
  }
};

/**
 * Adds all the refs from the raw object to a global index
 * To improve performence in case we need to update objet in case the id of the ref has been changed
 * @param {BitRawObject} rawObject 
 */
function _addObjectRefsToIndex(index: { [string]: BitRawObject }, rawObject: BitRawObject) {
  const refs = rawObject.refs();
  refs.forEach((ref) => {
    index[ref] = rawObject;
  });
}

/**
 * Update a refrence for an object and return the parsed real object
 * @param {*} index - refs index in order to update refs if needed
 * @param {*} oldRef 
 * @param {*} newRef 
 */
const _updateRefsForObjects = (index: { [string]: BitRawObject }, oldRef: string, newRef: string): BitObject => {
  const realObject = index[oldRef].toRealObject();
  if (oldRef !== newRef) {
    // Get the dependent object and replace the ref to the new one
    logger.debug(`replacing refrence for ${realObject.id()} old ref was: ${oldRef} new ref is:${newRef}`);
    if (globalVerbose) {
      console.log(`replacing refrence for ${realObject.id()} old ref was: ${oldRef} new ref is:${newRef}`);
    }
    realObject.replaceRef(new Ref(oldRef), new Ref(newRef));
  }
  return realObject;
};

/**
 * Get the real object and update refs if needed
 * The result will be added to the result cache
 * @param {ScopeMigrationResultCache} result - results cache
 * @param {{ [string]: BitRawObject}} index - refs index in order to update refs if needed
 */
const _getRealObjectWithUpdatedRefs = (
  result: ScopeMigrationResultCache,
  index: { [string]: BitRawObject }
): Funcion => (object: BitRawObject) => {
  const realObject = object.toRealObject();
  // Make sure to not ovveride result we already put during the updte ref process
  if (result.newObjects[realObject.hash().hash]) return;
  result.newObjects[realObject.hash().hash] = realObject;
  // Check if we need to update ref
  if (realObject.hash().hash !== object.ref) {
    result.refsToRemove.push(new Ref(object.ref));
    const dependentObject = _updateRefsForObjects(index, object.ref, realObject.hash().hash);
    result.newObjects[dependentObject.hash().hash] = dependentObject;
  }
};
