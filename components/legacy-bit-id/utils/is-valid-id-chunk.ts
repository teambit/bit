const validationRegExp = /^[-_a-z0-9/]+$/;
const validationRegExpDisallowSlash = /^[-_a-z0-9]+$/;

export default function isValidIdChunk(val: any, allowSlash = true): boolean {
  if (typeof val !== 'string') return false;
  if (val.includes('//')) return false;
  const regex = allowSlash ? validationRegExp : validationRegExpDisallowSlash;
  return regex.test(val);
}
