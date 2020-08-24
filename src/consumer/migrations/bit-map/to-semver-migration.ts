import semver from 'semver';

import BitMap from '../../bit-map';

/**
 * Change all the component's version to be a valid semver
 * @param {*} bitMap - The bit map object
 */
function changeVersionToSemVer(bitMap: BitMap): BitMap {
  bitMap.getAllComponents().forEach((componentMap) => {
    // In case there is already a semver, do nothing
    const version = componentMap.id.version;
    if (version && !semver.valid(version) && typeof version === 'number') {
      const newVersion = `0.0.${version}`;
      componentMap.id = componentMap.id.changeVersion(newVersion);
    }
  });
  return bitMap;
}

const changeVersionToSemVerDeclartaion = {
  name: 'change bit map versions to SemVer',
  migrate: changeVersionToSemVer,
};

export default changeVersionToSemVerDeclartaion;
