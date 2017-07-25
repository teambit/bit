import isString from './is-string';

const validationRegExp = /^@?[$\-_!.a-z0-9]+$/;

/** @flow */
export default function isValidScopeName(val: any): boolean {
  if (!isString(val)) return false;
  return validationRegExp.test(val);
}
