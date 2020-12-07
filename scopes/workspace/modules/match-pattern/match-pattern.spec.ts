import { expect } from 'chai';

import {
  isMatchPattern,
  isMatchDirPatternItem,
  isMatchNamespacePatternItem,
  isMatchPatternItem,
  MATCH_ALL_ITEM,
  sortMatchesBySpecificity,
} from './match-pattern';

describe('isMatchDirPatternItem', () => {
  describe('item is matched', () => {
    it('exact match', () => {
      const res = isMatchDirPatternItem('bar', 'bar');
      expect(res.match).to.be.true;
      expect(res.specificity).to.equal(1);
    });

    it('pattern is part of dir', () => {
      const res = isMatchDirPatternItem('bar/foo', 'bar');
      expect(res.match).to.be.true;
      expect(res.specificity).to.equal(1);
    });
    it('specificity is larger than 1', () => {
      const res = isMatchDirPatternItem('bar/foo/baz', 'bar/foo');
      expect(res.match).to.be.true;
      expect(res.specificity).to.equal(2);
    });
  });
  describe('item is not matched', () => {
    it('simple unmatch', () => {
      const res = isMatchDirPatternItem('abc', 'def');
      expect(res.match).to.be.false;
      expect(res.specificity).to.equal(-1);
    });
    it('same suffix only', () => {
      const res = isMatchDirPatternItem('bar/foo', 'bzr/bar/foo');
      expect(res.match).to.be.false;
      expect(res.specificity).to.equal(-1);
    });
    it('dir is part of pattern item', () => {
      const res = isMatchDirPatternItem('bar', 'bar/foo');
      expect(res.match).to.be.false;
      expect(res.specificity).to.equal(-1);
    });
  });
});

describe('isMatchNamespacePatternItem', () => {
  describe('item is matched', () => {
    it('exact match', () => {
      const res = isMatchNamespacePatternItem('bar', '{bar}');
      expect(res.match).to.be.true;
      expect(res.specificity).to.equal(1);
    });

    it('pattern is part of name and ends with *', () => {
      const res = isMatchNamespacePatternItem('bar/foo', '{bar/*}');
      expect(res.match).to.be.true;
      expect(res.specificity).to.equal(1.1);
    });
    it('pattern is part of name and ends with * and name has more parts', () => {
      const res = isMatchNamespacePatternItem('bar/foo/baz', '{bar/*}');
      expect(res.match).to.be.true;
      expect(res.specificity).to.equal(1.1);
    });
    it('specificity is larger than 1', () => {
      const res = isMatchNamespacePatternItem('bar/foo/baz', '{bar/foo/*}');
      expect(res.match).to.be.true;
      expect(res.specificity).to.equal(2.2);
    });
    it('multiple *', () => {
      const res = isMatchNamespacePatternItem('bar/foo/baz/goo', '{bar/*/baz/*}');
      expect(res.match).to.be.true;
      expect(res.specificity).to.equal(2.4);
    });
  });
  describe('item is not matched', () => {
    it('simple unmatch', () => {
      const res = isMatchNamespacePatternItem('abc', '{def}');
      expect(res.match).to.be.false;
      expect(res.specificity).to.equal(-1);
    });
    it('name is part of pattern item', () => {
      const res = isMatchNamespacePatternItem('bar', '{bar/foo}');
      expect(res.match).to.be.false;
      expect(res.specificity).to.equal(-1);
    });
    it('pattern is part of name but not ends with *', () => {
      const res = isMatchNamespacePatternItem('bar/foo', '{bar}');
      expect(res.match).to.be.false;
      expect(res.specificity).to.equal(-1);
    });
    it('diff in the middle', () => {
      const res = isMatchNamespacePatternItem('bar/foo/baz', '{bar/goo/baz}');
      expect(res.match).to.be.false;
      expect(res.specificity).to.equal(-1);
    });
    it('same suffix only', () => {
      const res = isMatchNamespacePatternItem('bar/foo', '{bzr/bar/foo}');
      expect(res.match).to.be.false;
      expect(res.specificity).to.equal(-1);
    });
  });
});

describe('isMatchPatternItem', () => {
  describe('match all', () => {
    it('using match all pattern', () => {
      const res = isMatchPatternItem('bar', 'name', MATCH_ALL_ITEM);
      expect(res.match).to.be.true;
      expect(res.specificity).to.equal(0);
    });
  });
});

describe('isMatchPattern', () => {
  describe('no matches at all', () => {
    it('should return match false with maxSpecificity as -1', () => {
      const res = isMatchPattern('bar', 'name', 'foo, baz');
      expect(res.match).to.be.false;
      expect(res.maxSpecificity).to.equal(-1);
    });
  });
  describe('match one dir item', () => {
    it('should return match true with the correct maxSpecificity', () => {
      const res = isMatchPattern('bar/foo/baz', 'name', 'foo, bar/foo , baz');
      expect(res.match).to.be.true;
      expect(res.maxSpecificity).to.equal(2);
    });
  });
  describe('match more than one dir item', () => {
    it('should return match true with the correct maxSpecificity', () => {
      const res = isMatchPattern('bar/foo/baz', 'name', 'bar/foo, bar/foo/baz , baz, bar');
      expect(res.match).to.be.true;
      expect(res.maxSpecificity).to.equal(3);
    });
  });
  describe('match more than one namespace item', () => {
    it('should return match true with the correct maxSpecificity', () => {
      const res = isMatchPattern(
        'bar/foo/baz',
        'namespace1/namespace2/name',
        '{namespace1/namespace2/name}, {namespace1/namespace2/*} , baz, bar'
      );
      expect(res.match).to.be.true;
      expect(res.maxSpecificity).to.equal(3);
    });
  });
  describe('match more than one namespace item and more than one dir item', () => {
    it('should return match true with the correct maxSpecificity', () => {
      const res = isMatchPattern(
        'bar/foo/baz/goo',
        'namespace1/namespace2/name',
        '{namespace1/namespace2/name}, {namespace1/namespace2/*} , bar/foo, bar/foo/baz/goo , baz, bar'
      );
      expect(res.match).to.be.true;
      expect(res.maxSpecificity).to.equal(4);
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
