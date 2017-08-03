/** @flow */

/**
 * Builds a new collection by applying a function to all elements of 
 * this array and using the elements of the resulting collections.
 * @name flatMap
 * @param {[*]} array
 * @param {Function} cb
 * @returns {[*]}
 * @example
 * ```js
 *  flatMap([[1, 2, 3], [4, 5, 6]], val => val) // => [1, 2, 3, 4, 5, 6]
 * ```
 */
export default function flatMap(cb: Function) {
  return Array.prototype.concat.apply([], this.map(cb));
}
