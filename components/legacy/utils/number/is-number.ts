/**
 * determiens whether `val` is a number.
 * @name isNumber
 * @param {*} val
 * @returns {boolean}
 * @example
 * ```js
 *  isNumber('') // => false
 * ```
 */
export default function isNumber(val: any) {
  return typeof val === 'number';
}
