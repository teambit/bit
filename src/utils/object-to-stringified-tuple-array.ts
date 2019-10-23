import forEach from './object/foreach';

export default function objectToStringifiedTupleArray(obj: { [key: string]: any }): [string | number][] {
  const arr: any[] = [];
  forEach(obj, (val, key) => {
    arr.push([key, typeof val === 'object' ? JSON.stringify(val) : val]);
  });
  return arr;
}
