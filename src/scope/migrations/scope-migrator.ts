import R from 'ramda';
import { BitObject, BitRawObject, Ref } from '../objects';
import { BIT_VERSION } from '../../constants';
import getMigrationVersions from '../../migration/migration-helper';
import { MigrationDeclaration } from '../../migration/migration-helper';
import logger from '../../logger/logger';

export type ScopeMigrationResult = {
  newObjects: BitObject[];
  refsToRemove: Ref[];
};

type ScopeMigrationResultCache = {
  newObjects: { id: string; object: BitObject[] };
  refsToRemove: Ref[];
};

type VersionMigrationsDeclarations = {
  component: MigrationDeclaration[] | null | undefined;
  symlink: MigrationDeclaration[] | null | undefined;
  scopeMeta: MigrationDeclaration[] | null | undefined;
  version: MigrationDeclaration[] | null | undefined;
};

type VersionMigrations = {
  [version: string]: VersionMigrationsDeclarations;
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
export default async function migrate(
  migrations: VersionMigrations[],
  objects: BitRawObject[],
  verbose: boolean = false
): Promise<ScopeMigrationResult> {
  globalVerbose = verbose;
  const result = { newObjects: {}, refsToRemove: [] };
  if (R.isEmpty(migrations)) {
    const noMigrationMsg = 'there are no migrations to run, leaving the scope as is with no changes';
    logger.debug(noMigrationMsg);
    if (verbose) console.log(noMigrationMsg); // eslint-disable-line
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return result;
  }
  R.forEach(_runAllMigrationsForObject(migrations), objects);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  R.forEach(_getRealObjectWithUpdatedRefs(result, refsIndex), objects);
  result.newObjects = R.values(result.newObjects);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return result;
}

/**
 * Runs all the migrations for all the versions for a given object
 * @param {VersionMigrations[]} migrations
 */
const _runAllMigrationsForObject = (migrations: VersionMigrations[]): Function => (rawObject: BitRawObject) => {
  // Make sure we got a rawObject (we might get a null object in case of corrupted object)
  if (!rawObject) {
    return null;
  }
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
  try {
    const migratedContent = migration.migrate(rawObject.getParsedContent());
    rawObject.parsedContent = migratedContent;
    return migratedContent;
  } catch (err) {
    logger.error(`FAILED - running migration: ${migration.name} on object ${rawObject.ref} (${rawObject.id})`);
    throw err;
  }
};

/**
 * Adds all the refs from the raw object to a global index
 * To improve performence in case we need to update objet in case the id of the ref has been changed
 * @param {BitRawObject} rawObject
 */
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
const _updateRefsForObjects = (index: { [string]: BitRawObject }, oldRef: string, newRef: string): BitObject => {
  // If the object doesn't has a dependent object return null
  // This object reference won't be update anywhere
  if (!index[oldRef]) {
    logger.warn(`the object ref: ${oldRef} has been updated to: ${newRef} but there is no reference to this object`);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return null;
  }
  const realObject = index[oldRef].toRealObject();
  if (oldRef !== newRef) {
    // Get the dependent object and replace the ref to the new one
    logger.debug(`replacing reference for ${realObject.id()} old ref was: ${oldRef} new ref is: ${newRef}`);
    if (globalVerbose) {
      console.log(`replacing reference for ${realObject.id()} old ref was: ${oldRef} new ref is: ${newRef}`);
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
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  index: { [string]: BitRawObject }
): Function => (object: BitRawObject) => {
  // Make sure we got a rawObject (we might get a null object in case of corrupted object)
  if (!object) {
    return null;
  }
  const realObject = object.toRealObject();
  // Make sure to not ovveride result we already put during the updte ref process
  if (result.newObjects[realObject.hash().hash]) return null;
  result.newObjects[realObject.hash().hash] = realObject;
  // Check if we need to update ref
  if (realObject.hash().hash !== object.ref) {
    result.refsToRemove.push(new Ref(object.ref));
    const dependentObject = _updateRefsForObjects(index, object.ref, realObject.hash().hash);
    // Update the dependent object only if found one
    if (dependentObject) {
      result.newObjects[dependentObject.hash().hash] = dependentObject;
    }
  }
};
