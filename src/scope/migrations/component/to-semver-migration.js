/** @flow */
import R from 'ramda';
import semver from 'semver';

function changeVersionToSemVer(componentModel: Object): Object {
  const semVerVersions = {};
  const addUpdatedVersion = (value, key) => {
    // In case there is already a semver, do nothing
    if (semver.valid(key)) semVerVersions[key] = value;
    const newVersion = `0.0.${key}`;
    semVerVersions[newVersion] = value;
  };
  // Go over the versions array and update them
  R.forEachObjIndexed(addUpdatedVersion, componentModel.versions);
  componentModel.versions = semVerVersions;
  return componentModel;
}

const changeVersionToSemVerDeclartaion = {
  name: 'change version to SemVer',
  migrate: changeVersionToSemVer
};

export default changeVersionToSemVerDeclartaion;
