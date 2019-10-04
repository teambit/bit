/**
 * clean the first occurrence of (`char`) from a string (`str`)
 * @name cleanChar
 * @param {string} str string to mainpulate.
 * @param {string} char char to clean.
 * @returns {string} cleaned string.
 * ```js
 *  cleanChar('foo', 'f') // => 'oo'
 * ```
 */
export default function cleanChar(str: string, char: string): string {
  return str.replace(char, '');
}
