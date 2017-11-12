/** @flow */
/**
 * Retrive bitId with the highest version from a list according to provided id
 * @description will return the provided id if it's not with latest, if the list contains id without version / with the latest version it will return it
 * @param {BitId[] | string[]} bitIds
 * @param { string | BitId } bitId
 * @returns {string}
 */
import R from 'ramda';
import semver from 'semver';
import { BitId } from '../bit-id';

export default function getLatestVersionNumber(bitIds: BitId[] | string[], bitId: string | BitId) {
  const getParsed = id => (typeof id === 'string' ? BitId.parse(id) : id);
  const getString = (id, ignoreScope = false, ignoreVersion = true) => {
    if (!id) return undefined;
    return typeof id === 'string'
      ? BitId.parse(id).toString(ignoreScope, ignoreVersion)
      : id.toString(ignoreScope, ignoreVersion);
  };

  // If the bitId provided doesn't contain version we want to ignore scope during search always
  // otherwise we will have problems finding the version from the bitmap after we export the component
  // because we commit with a name without scope but the bitmap contain it with the scope name since it was exported
  // without this, we will always just return the first component in the bitmap which is really bad
  const ignoreScopeAlways = !getParsed(bitId).scope;

  const componentId = getParsed(bitId);
  if (!componentId.getVersion().latest) return bitId;

  const allVersionsForId = [];
  bitIds.map((id) => {
    if (getString(bitId, ignoreScopeAlways) === getString(id, ignoreScopeAlways)) {
      const version = getParsed(id).getVersion().versionNum;
      if (version) allVersionsForId.push(version);
    }
    return allVersionsForId;
  });

  // A case when the bitId provided doesn't exists in the array
  if (R.isEmpty(allVersionsForId)) return bitId;

  const maxVersion = semver.maxSatisfying(allVersionsForId, '*');
  const bitIdWithMaxVersion = getParsed(bitId).clone();
  bitIdWithMaxVersion.version = maxVersion;
  const result = bitIds.find((id) => {
    return getString(id, ignoreScopeAlways, false) === getString(bitIdWithMaxVersion, ignoreScopeAlways, false);
  });

  return result;
}
