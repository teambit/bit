import forEach from './object/foreach';

/**
 *
 */
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
export default function filterObject(obj: { [string: any]: any }, fn: (val: any, key: any) => boolean): any {
  const newObj = {};
  forEach(obj, (val, key) => {
    if (fn(val, key)) newObj[key] = val;
  });
  return newObj;
}
