import { expect } from 'chai';
import { getValidVersionOrReleaseType } from './semver-helper';

describe('semver-helper', () => {
  describe('getValidVersionOrReleaseType', () => {
    it('should recognize "patch" as releaseType', () => {
      const results = getValidVersionOrReleaseType('patch');
      expect(results.releaseType).to.equal('patch');
      expect(results.exactVersion).to.be.undefined;
    });
    it('should recognize "1.0.0" as exactVersion', () => {
      const results = getValidVersionOrReleaseType('1.0.0');
      expect(results.exactVersion).to.equal('1.0.0');
      expect(results.releaseType).to.be.undefined;
    });
  });
});
