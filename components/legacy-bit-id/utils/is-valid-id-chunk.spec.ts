import { expect } from 'chai';

import isValidIdChunk from './is-valid-id-chunk';

describe('isValidIdChunk', () => {
  it('should disallow non string inputs', () => {
    expect(isValidIdChunk(123)).to.be.false;
    expect(isValidIdChunk(123, true)).to.be.false;
  });
  it('should allow a string that consist of small letters', () => {
    expect(isValidIdChunk('abc')).to.be.true;
    expect(isValidIdChunk('abc', true)).to.be.true;
  });
  it('should disallow a string that has a capital letter', () => {
    expect(isValidIdChunk('Abc')).to.be.false;
    expect(isValidIdChunk('Abc', true)).to.be.false;
  });
  it('should disallow a string that has two slashes one after another', () => {
    expect(isValidIdChunk('abc//', true)).to.be.false;
  });
});
