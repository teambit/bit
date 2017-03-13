'use strict';

var _crypto = require('crypto');

var _crypto2 = _interopRequireDefault(_crypto);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

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
  return _crypto2.default.createHash('sha1').update(data).digest(encoding || 'hex');
};