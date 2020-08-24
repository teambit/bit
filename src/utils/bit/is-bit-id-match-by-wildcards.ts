import R from 'ramda';

import BitId from '../../bit-id/bit-id';

export default function isBitIdMatchByWildcards(bitId: BitId, idsWithWildcard: string[] | string): boolean {
  if (!Array.isArray(idsWithWildcard)) idsWithWildcard = [idsWithWildcard];
  const regexPatterns = idsWithWildcard.map((id) => getRegex(id));
  const isNameMatchByWildcard = (name: string): boolean => {
    return regexPatterns.some((regex) => regex.test(name));
  };
  return (
    isNameMatchByWildcard(bitId.toStringWithoutVersion()) ||
    isNameMatchByWildcard(bitId.toStringWithoutScopeAndVersion())
  );
}

function getRegex(idWithWildcard) {
  if (!R.is(String, idWithWildcard)) {
    throw new TypeError(`filterComponentsByWildcard expects idWithWildcard to be string, got ${typeof idWithWildcard}`);
  }
  const rule = idWithWildcard.replace(/\*/g, '.*');
  return new RegExp(`^${rule}$`);
}
