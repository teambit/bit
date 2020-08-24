import { expect } from 'chai';

import hasWildcard from './has-wildcard';

describe('hasWildcard', () => {
  describe('using string', () => {
    it('should return true when an id has asterisks', () => {
      expect(hasWildcard('my/id/*')).to.be.true;
    });
    it('should return false when an id does not have asterisks', () => {
      expect(hasWildcard('my/id/')).to.be.false;
    });
    it('should return false when an id is undefined', () => {
      expect(hasWildcard(undefined)).to.be.false;
    });
    it('should return false when an id is null', () => {
      expect(hasWildcard(null)).to.be.false;
    });
  });
  describe('using an array of strings', () => {
    it('should return true when one of the items has wildcard', () => {
      expect(hasWildcard(['first/id', 'second/id*'])).to.be.true;
    });
    it('should return false when all of the items do not have wildcard', () => {
      expect(hasWildcard(['first/id', 'second/id', 'third/id'])).to.be.false;
    });
    it('should return false when items are undefined or null', () => {
      // @ts-ignore
      expect(hasWildcard([undefined, null])).to.be.false;
    });
  });
});
