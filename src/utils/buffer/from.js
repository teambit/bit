const isArrayBuffer = require('is-array-buffer-x');

function fromArrayBuffer(obj, byteOffset, length) {
  byteOffset >>>= 0;

  const maxLength = obj.byteLength - byteOffset;

  if (maxLength < 0) {
    throw new RangeError("'offset' is out of bounds");
  }

  if (length === undefined) {
    length = maxLength;
  } else {
    length >>>= 0;

    if (length > maxLength) {
      throw new RangeError("'length' is out of bounds");
    }
  }

  return isModern
    ? Buffer.from(obj.slice(byteOffset, byteOffset + length))
    : new Buffer(new Uint8Array(obj.slice(byteOffset, byteOffset + length)));
}

function fromString(string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8';
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('"encoding" must be a valid string encoding');
  }

  return isModern ? Buffer.from(string, encoding) : new Buffer(string, encoding);
}

const isModern =
  typeof Buffer.alloc === 'function' && typeof Buffer.allocUnsafe === 'function' && typeof Buffer.from === 'function';

/**
 * A polyfill for Buffer.from, uses native implementation if available.
 * @name bufferFrom
 * @param {*} value
 * @returns Buffer
 * @example
 * ```js
 *  bufferFrom([1, 2, 3, 4]) // => <Buffer 01 02 03 04> 
 *  const arr = new Uint8Array([1, 2, 3, 4])
 *  bufferFrom(arr.buffer, 1, 2) // => <Buffer 02 03> 
 *
 *  bufferFrom('test', 'utf8') // => <Buffer 74 65 73 74>  
 *  const buf = bufferFrom('test')
 *  bufferFrom(buf) // => <Buffer 74 65 73 74> 
 * ```
 */
module.exports = function from(value, encodingOrOffset, length) {
  if (typeof value === 'number') {
    throw new TypeError('"value" argument must not be a number');
  }

  if (isArrayBuffer(value)) {
    return fromArrayBuffer(value, encodingOrOffset, length);
  }

  if (typeof value === 'string') {
    return fromString(value, encodingOrOffset);
  }

  return isModern ? Buffer.from(value) : new Buffer(value);
};
