import forEach from './foreach';

/**
 * get all object values.
 * @name values
 * @param {object} object
 * @returns {[]} object's values
 * @example
 * ```js
 *  values({ a: 1, b: 2, c: 3 }) // => [1, 2, 3]
 * ```
 */
export default function values(object: { [key: string]: any }): any[] {
  const objValues = [];
  forEach(object, val => objValues.push(val));
  return objValues;
}
