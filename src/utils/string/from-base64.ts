/**
 * decode a base64 string
 * @name fromBase64
 * @param {string} base64 base64 string to decode
 * @returns {string} decoded string
 * @example
 * ```js
 *  fromBase64('aGVsbG8gd29ybGQ=') // => 'hello world'
 * ```
 */
export default function fromBase64(base64: string): string {
  return Buffer.from(base64, 'base64').toString();
}
