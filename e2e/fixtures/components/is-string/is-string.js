/** @flow */

/**
 * detemines whether `str` is a string.
 * @name isString
 * @param {*} val
 * @returns {boolean}
 * @example
 *  isString(3) // => false
 *  isString('') // => true
 */
export default function isString(val: string): boolean {
  return typeof val === 'string';
}
