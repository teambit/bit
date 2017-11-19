/** @flow */
import R from 'ramda';
import semver from 'semver';
import BitMap from '../../bit-map';
import { VERSION_DELIMITER } from '../../../constants';

/**
 * Change all the component's version to be a valid semver
 * @param {*} bitMap - The bit map object
 */
function changeVersionToSemVer(bitMap: BitMap): BitMap {
  const addUpdatedVersion = (value, key) => {
    // In case there is already a semver, do nothing
    const splitedId = key.split(VERSION_DELIMITER);
    const version = splitedId[1];
    if (version && !semver.valid(version)) {
      const newVersion = `0.0.${version}`;
      const newId = `${splitedId[0]}${VERSION_DELIMITER}${newVersion}`;
      bitMap.components[newId] = value;
      delete bitMap.components[key];
    }
  };
  // Go over the versions array and update them
  R.forEachObjIndexed(addUpdatedVersion, bitMap.getAllComponents());
  return bitMap;
}

const changeVersionToSemVerDeclartaion = {
  name: 'change bit map versions to SemVer',
  migrate: changeVersionToSemVer
};

export default changeVersionToSemVerDeclartaion;
