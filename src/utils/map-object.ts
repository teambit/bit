export type Iteratee = (val: any, key: any) => any;

/**
 * Returns the results of applying the iteratee to each element of the object.
 * @param {object} object
 * @param {function(val, key)} iteratee
 * @returns {object}
 * @example
 * ```js
 * const newObj = mapObject({ start: 5, end: 12 }, function(val, key) {
 *   return val + 5;
 * });
 * console.log(newObj) //  { start: 10, end: 17 }
 * ```
 */
export default function mapObject(obj: Record<string, any>, iteratee: Iteratee) {
  const keys = Object.keys(obj);
  const mappedObject = {};

  keys.forEach((key) => {
    mappedObject[key] = iteratee(obj[key], key);
  });

  return mappedObject;
}
