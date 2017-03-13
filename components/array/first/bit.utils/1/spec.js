const { expect } = require('chai');

const first = require(__impl__);

describe('#first()', () => {
  it('should return `null` as array is empty', () => {
    expect(first([])).to.equal(null);
  });

  it('should return the first value of the array', () => {
    expect(first([1, 2, 3])).to.equal(1);
  });
});
