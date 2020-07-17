import R from 'ramda';
import semver from 'semver';
import BitId from '../../../bit-id/bit-id';
import logger from '../../../logger/logger';
import { VERSION_DELIMITER } from '../../../constants';

/**
 * Change the dependencies versions and the compiler / testers ids to semver
 * @param {*} versionModel - The parsed version model
 */
function changeVersionToSemVer(versionModel: Object): Object {
  const getUpdatedDependency = (dependency) => {
    // Take care of very old models when the dependencies were strings
    // in this case we will keep it string but change it to contain semver
    // Those old model will still not work after this migration
    if (typeof dependency === 'string') {
      logger.warn("The dependency dependency is stored with an old format, this version won't work properly");
      dependency = { id: _getUpdatedId(dependency), relativePaths: [] };
      return dependency;
    }
    dependency.id = _getUpdatedId(dependency.id);
    return dependency;
  };

  // Go over the versions array and update them
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const dependencies = R.map(getUpdatedDependency, versionModel.dependencies);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const flattenedDependencies = R.map(_getUpdatedId, versionModel.flattenedDependencies);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  versionModel.dependencies = dependencies;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  versionModel.flattenedDependencies = flattenedDependencies;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (versionModel.tester) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    versionModel.tester = _getUpdatedId(versionModel.tester);
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (versionModel.compiler) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    versionModel.compiler = _getUpdatedId(versionModel.compiler);
  }
  return versionModel;
}

function _getUpdatedId(id) {
  try {
    // Fix also old version seperator (::)
    if (id.includes('::')) {
      id = id.replace('::', VERSION_DELIMITER);
    }
    const parsedId = BitId.parseBackwardCompatible(id);
    // Don't convert latest word
    if (parsedId.getVersion().latest) {
      return id;
    }

    let version = parsedId.getVersion().versionNum;
    // In case there is already a semver, do nothing
    if (!semver.valid(version)) {
      version = `0.0.${version}`;
    }
    const newId = `${parsedId.toStringWithoutVersion()}${VERSION_DELIMITER}${version}`;
    return newId;
  } catch (err) {
    logger.error(`couldn't parse the id ${id} in order to migrate it to semver`);
    throw err;
  }
}

const changeVersionToSemVerDeclartaion = {
  name: "change version's (deps & compiler / tester) to SemVer",
  migrate: changeVersionToSemVer,
};

export default changeVersionToSemVerDeclartaion;
