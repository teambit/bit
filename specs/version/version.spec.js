import { expect } from 'chai';
import Version from '../../src/version';

describe('Version', () => {
  describe('toString()', () => {
    it('should return a latest tested version', () => {
      const version = new Version(10, true);
      expect(version.toString()).to.equal('*10');
    });

    it('should return latest', () => {
      const version = new Version(null, true);
      expect(version.toString()).to.equal('latest');
    });

    it('should return concrete version number', () => {
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

  describe('increase() + decrease()', () => {
    it('should increase concrete version by one', () => {
      const version = new Version(24, false);
      version.increase();
      expect(version.versionNum).to.equal(25);
    });

    it('should increase latest tested version by one', () => {
      const version = new Version(24, true);
      version.increase();
      expect(version.versionNum).to.equal(25);
    });

    it('should decrease concrete version by one', () => {
      const version = new Version(24, false);
      version.decrease();
      expect(version.versionNum).to.equal(23);
    });

    it('should decrease latest tested version by one', () => {
      const version = new Version(24, true);
      version.decrease();
      expect(version.versionNum).to.equal(23);
    });

    it('should throw an InvalidVersionChange error when trying to increase or decrease latest', () => {
      const version = new Version(null, true);
      expect(() => {
        version.increase();
      }).to.throw();

      expect(() => {
        version.decrease();
      }).to.throw();
    });
  });

  describe('parse()', () => {
    it('should parse given version as latest', () => {
      const version = Version.parse('latest');
      expect(version.versionNum).to.equal(null);
      expect(version.latest).to.equal(true);
    });
  });
});
