/** @flow */
/**
 * Retrieve latest bit version from latest to number
 * @param {Array<BitIds>} arr
 * @param {string} id
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
