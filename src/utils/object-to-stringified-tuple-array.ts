import forEach from './object/foreach';

// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
export default function objectToStringifiedTupleArray(obj: { [string | number]: any }): [string | number][] {
  const arr = [];
  forEach(obj, (val, key) => {
    arr.push([key, typeof val === 'object' ? JSON.stringify(val) : val]);
  });
  return arr;
}
