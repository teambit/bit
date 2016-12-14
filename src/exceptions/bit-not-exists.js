function BitNotExistsException(message) {
  this.name = 'BitNotExistsException';
  this.message = message || 'The bit does not found in the specified directory';
  this.stack = (new Error()).stack;
  this.code = 'ENOENT';
}
BitNotExistsException.prototype = Object.create(Error.prototype);
BitNotExistsException.prototype.constructor = BitNotExistsException;

module.exports = BitNotExistsException;
