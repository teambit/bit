/**
 * encode a string or a buffer to base64
 * @name toBase64
 * @param {string|Buffer} val string or buffer to encode
 * @returns {string} base64 encoded string
 * @example
 * ```js
 *  toBase64('foo bar') // => Zm9vIGJhcg==
 *  toBase64(Buffer.from('foo bar')) // => Zm9vIGJhcg==
 * ```
 */
export default function toBase64(val: string | Buffer) {
  if (val instanceof Buffer) return val.toString('base64');
  return Buffer.from(val).toString('base64');
}
