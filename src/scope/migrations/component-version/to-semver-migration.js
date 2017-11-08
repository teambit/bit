/** @flow */
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
    dependency.id = _getUpdatedId(dependency.id);
    return dependency;
  };

  // Go over the versions array and update them
  const dependencies = R.map(getUpdatedDependency, versionModel.dependencies);
  const flattenedDependencies = R.map(_getUpdatedId, versionModel.flattenedDependencies);
  versionModel.dependencies = dependencies;
  versionModel.flattenedDependencies = flattenedDependencies;
  if (versionModel.tester) {
    versionModel.tester = _getUpdatedId(versionModel.tester);
  }
  if (versionModel.compiler) {
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
    const parsedId = BitId.parse(id);
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
  migrate: changeVersionToSemVer
};

export default changeVersionToSemVerDeclartaion;
