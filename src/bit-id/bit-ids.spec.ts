import { expect } from 'chai';

import { BitId, BitIds } from '.';

describe('bitIds', () => {
  describe('uniqFromArray', () => {
    it('should return a uniq array with no duplications', () => {
      const a = new BitId({ name: 'a' });
      const b = new BitId({ name: 'a' });
      expect(BitIds.uniqFromArray([a, b])).to.have.lengthOf(1);
    });
  });
  describe('search functions', () => {
    let bitIds;
    before(() => {
      const a = new BitId({ name: 'a', scope: 'my-scope', version: '0.0.1' });
      const b = new BitId({ name: 'b' });
      const c = new BitId({ name: 'c' });
      bitIds = new BitIds(a, b, c);
    });
    describe('search', () => {
      it('should find an exact match', () => {
        const result = bitIds.search(new BitId({ name: 'a', scope: 'my-scope', version: '0.0.1' }));
        expect(result).to.be.an.instanceOf(BitId);
        expect(result.serialize()).to.deep.equal({ name: 'a', scope: 'my-scope', version: '0.0.1' });
      });
      it('should find a match when an ID has only name', () => {
        const result = bitIds.search(new BitId({ name: 'b' }));
        expect(result).to.be.an.instanceOf(BitId);
        expect(result.serialize()).to.deep.equal({ name: 'b' });
      });
      it('should not return a result with a mismatch version', () => {
        const result = bitIds.search(new BitId({ name: 'a', scope: 'my-scope', version: '0.0.2' }));
        expect(result).to.be.undefined;
      });
      it('should not return a result with a mismatch scope', () => {
        const result = bitIds.search(new BitId({ name: 'a', scope: 'my-another-scope', version: '0.0.1' }));
        expect(result).to.be.undefined;
      });
    });
    describe('searchWithoutVersion', () => {
      it('should find an exact match', () => {
        const result = bitIds.searchWithoutVersion(new BitId({ name: 'a', scope: 'my-scope', version: '0.0.1' }));
        expect(result).to.be.an.instanceOf(BitId);
        expect(result.serialize()).to.deep.equal({ name: 'a', scope: 'my-scope', version: '0.0.1' });
      });
      it('should return a result even with a mismatch version', () => {
        const result = bitIds.searchWithoutVersion(new BitId({ name: 'a', scope: 'my-scope', version: '0.0.2' }));
        expect(result).to.be.an.instanceOf(BitId);
        expect(result.serialize()).to.deep.equal({ name: 'a', scope: 'my-scope', version: '0.0.1' });
      });
      it('should not return a result with a mismatch scope', () => {
        const result = bitIds.searchWithoutVersion(
          new BitId({ name: 'a', scope: 'my-another-scope', version: '0.0.1' })
        );
        expect(result).to.be.undefined;
      });
    });
    describe('searchWithoutScopeAndVersion', () => {
      it('should find an exact match', () => {
        const result = bitIds.searchWithoutScopeAndVersion(
          new BitId({ name: 'a', scope: 'my-scope', version: '0.0.1' })
        );
        expect(result).to.be.an.instanceOf(BitId);
        expect(result.serialize()).to.deep.equal({ name: 'a', scope: 'my-scope', version: '0.0.1' });
      });
      it('should return a result even with a mismatch version', () => {
        const result = bitIds.searchWithoutScopeAndVersion(
          new BitId({ name: 'a', scope: 'my-scope', version: '0.0.2' })
        );
        expect(result).to.be.an.instanceOf(BitId);
        expect(result.serialize()).to.deep.equal({ name: 'a', scope: 'my-scope', version: '0.0.1' });
      });
      it('should return a result even with a mismatch scope', () => {
        const result = bitIds.searchWithoutScopeAndVersion(
          new BitId({ name: 'a', scope: 'my-another-scope', version: '0.0.1' })
        );
        expect(result).to.be.an.instanceOf(BitId);
        expect(result.serialize()).to.deep.equal({ name: 'a', scope: 'my-scope', version: '0.0.1' });
      });
    });
  });
  describe('difference', () => {
    it('should remove entries from the provided array', () => {
      const a = new BitId({ name: 'a' });
      const b = new BitId({ name: 'b' });
      const c = new BitId({ name: 'c' });
      const bitIds = BitIds.fromArray([a, b]);
      const bitIds2 = BitIds.fromArray([b, c]);
      const res = bitIds.difference(bitIds2);
      expect(res).to.have.lengthOf(1);
      expect(res.serialize()[0].toString()).to.equal('a');
    });
  });
});
