import cleanChar from './clean-char';

/**
 * remove first bang (!) from `str`
 * @name cleanBang
 * @param {string} str string to manipulate
 * @returns {string} string without first found bang
 * @example
 * ```js
 *  cleanBang('!bang') // =>  'bang'
 * ```
 */
export default function cleanBang(str: string): string {
  return cleanChar(str, '!');
}
