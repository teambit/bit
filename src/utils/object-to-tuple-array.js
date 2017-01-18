/** @flow */
import forEach from './foreach';

export default function objectToTupleArray(obj: {[string|number]: any}): [string|number][] {
  const arr = [];
  forEach(obj, (val, key) => {
    arr.push([key, val]);
  });
  return arr;
}
