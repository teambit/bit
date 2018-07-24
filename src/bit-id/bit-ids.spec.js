import { expect } from 'chai';
import { BitId, BitIds } from '.';

describe('bitIds', () => {
  describe('getUniq', () => {
    it('should return a uniq array with no duplications', () => {
      const a = new BitId({ name: 'a' });
      const b = new BitId({ name: 'a' });
      const bitIds = new BitIds(a, b);
      expect(bitIds.getUniq()).to.have.lengthOf(1);
    });
  });
});
