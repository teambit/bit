/** @flow */

/**
 * determines whether string `str` ref contains substring `searchRef`.
 * @name contains
 * @param {string} str
 * @param {string} searchStr
 * @returns {boolean} 
 * @example
 * ```js
 *  contains('foo bar', 'bar') // => true
 *  contains('foo', 'bar') // => false
 * ```
 */
module.exports = function contains(str: string, searchStr: string): boolean {
  return str.indexOf(searchStr) !== -1;
};
