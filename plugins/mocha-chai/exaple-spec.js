const chai = require('chai');
// const bit = require('./bit-node');

// const isNumberMock = (n) => typeof n === 'number';
// bit.mockBits({  //TODO - mock for bits in bit node
//     'is-number': isNumberMock
// });

// bit.mockModules({  //TODO - mock for modules in bit node
//     'is-number': isNumberMock
// });

const isString = require(__impl__); // eslint-disable-line

describe('isString function', () => {
  it('should return true if inserted a string', () => {
    return chai.assert.equal(isString('stringy'), true);
  });
  it('should return false if inserted a number', () => {
    return chai.assert.equal(isString(2), false);
  });
});

describe('isString function', () => {
  it('should return true if inserted a string', () => {
    return chai.assert.equal(isString('stringy'), false);
  });
  it('should return false if inserted a number', () => {
    return chai.assert.equal(isString(2), true);
  });
});
