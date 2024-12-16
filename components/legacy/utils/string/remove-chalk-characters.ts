/**
 * remove chalk characters from a string.
 * @name removeChalkCharacters
 * @param {*} str string to remove the chalk characters from
 * @returns {string}
 * @example
 * ```js
 *  removeChalkCharacters('\u001b[37mbit.envs/bundlers/vue\u001b[39m') // => bit.envs/bundlers/vue
 * ```
 */
export default function removeChalkCharacters(str?: string | null | undefined): string | null | undefined {
  if (!str) return str;
  // eslint-disable-next-line no-control-regex
  return str.replace(/\u001b\[.*?m/g, '');
}
