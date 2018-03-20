import { expect } from 'chai';
import Helper from '../e2e-helper';

describe.skip('dependencies versions resolution', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('when bit.json has different version than the model', () => {
    it('should use the dependency version from bit.json', () => {});
  });
  describe('when package.json has different version than the model', () => {
    describe('when the package.json of the dependents is different', () => {
      it('should use the dependency version from package.json', () => {});
    });
    describe('when the package.json of the dependency is different', () => {
      it('should use the dependency version from package.json', () => {});
    });
    describe('when the package.json of the dependents has ~ or ^ characters', () => {
      it('should strip those characters and get the exact version', () => {});
    });
    describe('when the the dependents has package.json file but it does not contain the dependency and the root package.json does', () => {
      // @todo: this should be fixed in bit-javascript resolveNodePackage() to work this way
      // currently if it finds package.json in the dependents it stops there, doesn't find the
      // dependency and goes directly to the dependency directory.
      it('should find the dependency version from the root package.json', () => {});
    });
  });
  describe('when bitmap has different version than the model', () => {
    it('should use the dependency version from the bitmap', () => {});
  });
  describe('when only the model has a version', () => {
    it('should use the dependency version from the model', () => {});
  });
});
