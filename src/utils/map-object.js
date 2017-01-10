/** @flow */
export type Iteratee = (val: any, key: any) => any;

export default function mapObject(obj: Object, iteratee: Iteratee) {
  const keys = Object.keys(obj);
  const mappedObject = {};

  keys.forEach((key) => {
    mappedObject[key] = iteratee(obj[key], key);
  });

  return mappedObject;
}
