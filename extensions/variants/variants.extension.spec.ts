import { expect } from 'chai';

import { isMatchPattern, isMatchPatternItem, MATCH_ALL_ITEM, sortMatchesBySpecificity } from './variants.main.runtime';

describe('isMatchPatternItem', () => {
  describe('match all', () => {
    it('using match all pattern', () => {
      const res = isMatchPatternItem('bar', MATCH_ALL_ITEM);
      expect(res.match).to.be.true;
      expect(res.specificity).to.equal(0);
    });
  });
  describe('item is matched', () => {
    it('exact match', () => {
      const res = isMatchPatternItem('bar', 'bar');
      expect(res.match).to.be.true;
      expect(res.specificity).to.equal(1);
    });

    it('dir is pattern is part of dir', () => {
      const res = isMatchPatternItem('bar/foo', 'bar');
      expect(res.match).to.be.true;
      expect(res.specificity).to.equal(1);
    });
    it('specificity is larger than 1', () => {
      const res = isMatchPatternItem('bar/foo/baz', 'bar/foo');
      expect(res.match).to.be.true;
      expect(res.specificity).to.equal(2);
    });
  });
  describe('item is matched', () => {
    it('simple unmatch', () => {
      const res = isMatchPatternItem('abc', 'def');
      expect(res.match).to.be.false;
      expect(res.specificity).to.equal(-1);
    });
    it('same suffix only', () => {
      const res = isMatchPatternItem('bar/foo', 'bzr/bar/foo');
      expect(res.match).to.be.false;
      expect(res.specificity).to.equal(-1);
    });
    it('dir is part of pattern item', () => {
      const res = isMatchPatternItem('bar', 'bar/foo');
      expect(res.match).to.be.false;
      expect(res.specificity).to.equal(-1);
    });
  });
});

describe('isMatchPattern', () => {
  describe('no matches at all', () => {
    it('should return match false with maxSpecificity as -1', () => {
      const res = isMatchPattern('bar', 'foo, baz');
      expect(res.match).to.be.false;
      expect(res.maxSpecificity).to.equal(-1);
    });
  });
  describe('match one item', () => {
    it('should return match true with the correct maxSpecificity', () => {
      const res = isMatchPattern('bar/foo/baz', 'foo, bar/foo , baz');
      expect(res.match).to.be.true;
      expect(res.maxSpecificity).to.equal(2);
    });
  });
  describe('match more than one item', () => {
    it('should return match true with the correct maxSpecificity', () => {
      const res = isMatchPattern('bar/foo/baz', 'bar/foo, bar/foo/baz , baz, bar');
      expect(res.match).to.be.true;
      expect(res.maxSpecificity).to.equal(3);
    });
  });
});

describe('sortMatchesBySpecificity', () => {
  describe('descending sort', () => {
    it('should descending sort matches by specificity', () => {
      const match1 = {
        specificity: 5,
        config: {},
      };
      const match2 = {
        specificity: 3,
        config: {},
      };
      const match3 = {
        specificity: 7,
        config: {},
      };
      const matches = [match1, match2, match3];
      const res = sortMatchesBySpecificity(matches);
      expect(res[0].specificity).to.equal(7);
      expect(res[1].specificity).to.equal(5);
      expect(res[2].specificity).to.equal(3);
    });
  });
});
