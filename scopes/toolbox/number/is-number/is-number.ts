/**
 * determines whether `val` is a number.
 * @name isNumber
 * @param {*} val
 * @returns {boolean}
 * @example
 * ```js
 *  isNumber('') // => false
 * ```
 */
export function isNumber(val: any) {
  return typeof val === 'number';
}
