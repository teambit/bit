import forEach from './object/foreach';

export default function filterObject(obj: Record<string, any>, fn: (val: any, key: any) => boolean): any {
  const newObj = {};
  forEach(obj, (val, key) => {
    if (fn(val, key)) newObj[key] = val;
  });
  return newObj;
}
