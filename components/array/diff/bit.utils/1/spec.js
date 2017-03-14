const { expect } = require('chai');

const diff = require(__impl__);

describe('#array/diff()', () => {
  it('should return an empty array as both arrays are equal', () => {
    return expect(diff([1, 2, 3], [1, 2, 3])).to.deep.equal([]);
  });

  it('should return the difference between the two arrays (1, 5, 6)', () => {
    return expect(diff([2, 3], [1, 2, 3, 5, 6])).to.deep.equal([1, 5, 6]);
  });  
});
