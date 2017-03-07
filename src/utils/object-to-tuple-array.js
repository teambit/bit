/** @flow */
import forEach from './foreach';

export default function objectToTupleArray(obj: {[string]: any}): [string, any][] {
  const arr = [];
  forEach(obj, (val, key) => {
    arr.push([key, val]);
  });
  return arr;
}
