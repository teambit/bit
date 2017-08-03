/** @flow */
import forEach from './object/foreach';

export default function objectToStringifiedTupleArray(obj: {[string|number]: any}): [string|number][] {
  const arr = [];
  forEach(obj, (val, key) => {
    arr.push([key, (typeof val === 'object') ? JSON.stringify(val) : val ]);
  });
  return arr;
}
