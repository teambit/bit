'use strict';

/**
 * encode a string or a buffer to base64
 * @name toBase64
 * @param {string|Buffer} val string or buffer to encode
 * @returns {string} base64 encoded string
 * @example
 * ```js
 *  toBase64('foo bar') // => Zm9vIGJhcg==
 *  toBase64(new Buffer('foo bar')) // => Zm9vIGJhcg==
 * ```
 */
module.exports = function toBase64(val) {
  if (val instanceof Buffer) return val.toString('base64');
  return new Buffer(val).toString('base64');
};