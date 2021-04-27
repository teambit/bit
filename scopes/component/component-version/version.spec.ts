import { expect } from 'chai';

import { Version } from './version';

describe('Version', () => {
  describe('toString()', () => {
    it('should return a latest tested version', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const version = new Version(10, true);
      expect(version.toString()).to.equal('*10');
    });

    it('should return latest', () => {
      const version = new Version(null, true);
      expect(version.toString()).to.equal('latest');
    });

    it('should return concrete version number', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const version = new Version(12, false);
      expect(version.toString()).to.equal('12');
    });

    it('should throw an invalid version exception', () => {
      const version = new Version(null, false);
      expect(() => {
        version.toString();
      }).to.throw();
    });
  });
});
