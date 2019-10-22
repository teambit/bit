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
export default function isString(val: any): val is string {
  return typeof val === 'string';
}
