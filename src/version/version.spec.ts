import { expect } from 'chai';

import Version from '../version';

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

  describe('increase()', () => {
    it('should increase patch version by one by default', () => {
      const version = new Version('0.0.1', false);
      version.increase();
      expect(version.versionNum).to.equal('0.0.2');
    });

    it('should increase patch version by one', () => {
      const version = new Version('0.0.1', false);
      version.increase('patch');
      expect(version.versionNum).to.equal('0.0.2');
    });

    it('should increase minor version by one', () => {
      const version = new Version('0.0.1', false);
      version.increase('minor');
      expect(version.versionNum).to.equal('0.1.0');
    });

    it('should increase major version by one', () => {
      const version = new Version('0.0.1', false);
      version.increase('major');
      expect(version.versionNum).to.equal('1.0.0');
    });

    it('should increase latest tested version by one', () => {
      const version = new Version('0.0.1', true);
      version.increase();
      expect(version.versionNum).to.equal('0.0.2');
    });

    it('should throw an InvalidVersionChange error when trying to increase or decrease latest', () => {
      const version = new Version(null, true);
      expect(() => {
        version.increase();
      }).to.throw();
    });
  });
});
