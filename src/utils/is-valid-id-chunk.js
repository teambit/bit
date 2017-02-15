import isString from './is-string';

const validationRegExp = /^[$\-_!.a-z0-9]+$/;

/** @flow */
export default function isValidIdChunk(val: any): boolean {
  if (!isString(val)) return false;
  return validationRegExp.test(val);
}
