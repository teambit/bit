/** @flow */
import forEach from './foreach';

export default function clean(obj: {[any]: any}) {
  const newObj = {};

  forEach(obj, (val, key) => {
    if (!val) return;
    newObj[key] = val;
  });

  return newObj;
}
