import { expect } from 'chai';
import { isNumber } from './is-number';

describe('Is number', () => {
  it('should return false on a string', () => {
    expect(isNumber('not a number')).to.equal(false);
  });

  it('should return true on a number', () => {
    expect(isNumber(1)).to.equal(true);
  });
});
