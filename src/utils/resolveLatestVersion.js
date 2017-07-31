/** @flow */
/**
 * Retrive bitId with the highest version from a list according to provided id
 * @description will return the provided id if it's not with latest, if the list contains id without version / with the latest version it will return it
 * @param {BitId[] | string[]} bitIds
 * @param { string | BitId } bitId
 * @returns {string}
 */
import maxBy from 'lodash.maxby';
import { BitId } from '../bit-id';

export default function getLatestVersionNumber(bitIds: BitId[] | string[], bitId: string | BitId) {
  const getParsed = (id) => (typeof id === 'string') ? BitId.parse(id) : id;
  const getString = (id) => (typeof id === 'string') ? id : id.toString(false, true);

  const componentId = getParsed(bitId);
  if (!componentId.getVersion().latest) return bitId;
  const maxByFunc = searchId => (id) => {
    if (getString(searchId) === getString(id)){
      const version = getParsed(id).getVersion();
      if (version.latest) return 10000000;
      return version.versionNum;
    }
    return -1;
  };
  return maxBy(bitIds, maxByFunc(bitId));
}
