/** @flow */
import forEach from './foreach';

export default function filter(obj: Object, cb: (val: any, key: any) => boolean) {
  const newObj = {};

  forEach(obj, (val, key) => {
    if (cb(val, key)) newObj[key] = val;
  });

  return obj;
} 
