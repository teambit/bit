const { expect } = require('chai');

const bufferFrom = require(__impl__);

describe('#buffer/from()', () => {
  it('should allocate a new Buffer using an array of octets', () => {
    return expect(bufferFrom([1, 2, 3, 4]).toString('hex')).to.equal('01020304');
  });

  it('should share the same allocated memory as the TypedArray with given offset and length', () => {
  	var arr = new Uint8Array([1, 2, 3, 4])
    return expect(bufferFrom(arr.buffer, 1, 2).toString('hex')).to.equal('0203');
  });

  it('should create a new Buffer containing the given string with utf8 encoding.', () => {
    return expect(bufferFrom('test', 'utf8').toString('hex')).to.equal('74657374');
  });

  it('should copy the passed buffer data onto a new Buffer instance', () => {
  	var buf = bufferFrom('test')
    return expect(bufferFrom(buf).toString('hex')).to.equal('74657374');
  });
  
});


