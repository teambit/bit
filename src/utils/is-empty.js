/** @flow */
import hasOwnProperty from './has-own-property';

export default function isEmpty(obj: Object): boolean {
  for (const n in obj) if (hasOwnProperty(obj, n) && obj[n]) return false; // eslint-disable-line
  return true;
}
