/** @array */

/**
 * returns the first element of an array reference.
 * @param {[]} array
 * @returns {*|null} first element of given array
 * @example
 * ```js
 *   first([1,2,3]) // => 1
 * ```
 */
export default function first(array: any[]): ?any {
  if (array && array[0]) return array[0];
  return null;
}
