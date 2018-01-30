import { expect } from 'chai';
import isString from './is-string';

describe('#isString()', () => {
  it('should return false if undefined is passed', () => {
    expect(isString()).to.equal(false);
  });

  it('should return false if null is passed', () => {
    expect(isString(null)).to.equal(false);
  });

  it('should return false if a plain object is passed', () => {
    expect(isString({})).to.equal(false);
  });

  it('should return false if number is passed', () => {
    expect(isString(2)).to.equal(false);
  });

  it('should return true if string is passed', () => {
    expect(isString('foo')).to.equal(true);
  });
});
