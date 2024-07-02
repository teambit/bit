import R from 'ramda';
import { ComponentID } from '@teambit/component-id';

export function isBitIdMatchByWildcards(bitId: ComponentID, idsWithWildcard: string[] | string): boolean {
  if (!Array.isArray(idsWithWildcard)) idsWithWildcard = [idsWithWildcard];
  const regexPatterns = idsWithWildcard.map((id) => getRegex(id));
  const isNameMatchByWildcard = (name: string): boolean => {
    return regexPatterns.some((regex) => regex.test(name));
  };
  return bitId.hasScope()
    ? isNameMatchByWildcard(bitId.toStringWithoutVersion())
    : isNameMatchByWildcard(bitId._legacy.toStringWithoutScopeAndVersion());
}

function getRegex(idWithWildcard) {
  if (!R.is(String, idWithWildcard)) {
    throw new TypeError(`filterComponentsByWildcard expects idWithWildcard to be string, got ${typeof idWithWildcard}`);
  }
  const rule = idWithWildcard.replace(/\*/g, '.*');
  return new RegExp(`^${rule}$`);
}
