const validationRegExp = /^[-_a-z0-9/]+$/;
const validationRegExpDisallowSlash = /^[-_a-z0-9]+$/;

export default function isValidIdChunk(val: any, allowSlash = true): boolean {
  if (typeof val !== 'string') return false;
  return allowSlash ? validationRegExp.test(val) : validationRegExpDisallowSlash.test(val);
}
