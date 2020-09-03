import { expect } from 'chai';

import findDuplications from './find-duplications';

describe('findDuplications', () => {
  it('should find duplications in an array of strings', () => {
    const arr = ['a', 'b', 'c', 'a'];
    const result = findDuplications(arr);
    expect(result).to.deep.equal(['a']);
  });
  it('should not find duplications if there are not any', () => {
    const arr = ['a', 'b', 'c', 'd'];
    const result = findDuplications(arr);
    expect(result).to.deep.equal([]);
  });
  it('should find duplications in an array of numbers', () => {
    const arr = [1, 2, 2, 2, 3, 4, 5, 5, 6];
    const result = findDuplications(arr);
    expect(result).to.deep.equal([2, 5]);
  });
});
