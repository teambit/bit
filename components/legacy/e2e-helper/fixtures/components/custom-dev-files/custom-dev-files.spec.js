import { expect } from 'chai';
import isString from './custom-dev-files';

describe('#isString()', () => {
  it('should return false if undefined is passed', () => {
    expect(isString()).to.equal(false);
  });
});
