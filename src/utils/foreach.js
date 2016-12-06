/** @flow */
export default function forEach(obj: Object, cb: (val: any, key: any) => void) {
  const keys = Object.keys(obj);
  keys.forEach(key => cb(obj[key], key));
}
