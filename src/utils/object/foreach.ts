/**
 * Invoke a function for every key within given object or array.
 * @name forEach
 * @param {object} obj object or array to iterate
 * @param {function} cb callback function to invoke
 * @example
 * ```js
 *  forEach({ a: 1, b: 2, c: 3 }, (val, key) => console.log(key, val));
 *  // => a 1 b 2 c 3
 * ```
 */
export default function forEach<T>(obj: Record<string, T>, cb: (val: T, key: string) => void) {
  const keys = Object.keys(obj);
  keys.forEach((key) => cb(obj[key], key));
}
