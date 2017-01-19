/** @flow */
import forEach from './foreach';

export default function filterObject(obj: {[any]: any}, fn: (val: any, key: any) => bool): Object {
  const newObj = {};
  forEach(obj, (val, key) => {
    if (fn(val, key)) newObj[key] = val;
  });
  return newObj;
}
