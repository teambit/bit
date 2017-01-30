/** @flow */

/**
 * determines whether string `str` ref contains substring `searchRef`.
 * @param {string} str
 * @param {string} searchStr
 * @returns {boolean} 
 * @example
 * ```js
 *  contains('foo bar', 'bar') // => true
 *  contains('foo', 'bar') // => false
 * ```
 */
export default function contains(str: string, searchStr: string): boolean {
  return str.indexOf(searchStr) !== -1;
}
