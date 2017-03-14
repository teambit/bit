import crypto from 'crypto';

/**
 * encrypt `data` buffer or string into a sha1 hash
 * @param {string|Buffer}
 * @param {string} encoding
 * @returns {string} sha1 hash
 * @example
 * ```js
 *  sha1('foo bar') // => '3773dea65156909838fa6c22825cafe090ff8030'
 * ```
 */
module.exports = function sha1(data, encoding) {
  return crypto.createHash('sha1')
    .update(data)
    .digest(encoding || 'hex');
};
