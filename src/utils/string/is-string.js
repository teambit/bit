/** @flow */

/**
 * determines whether `val` is of type string.
 * @name isString
 * @param {*} val value to test.
 * @returns {boolean}
 * @example
 * ```js
 *  isString('') // => true
 *  isString(4) // => false
 * ```
 */
export default function isString(val: any): boolean {
  return typeof val === 'string';
}
