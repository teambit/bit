import chai, { expect } from 'chai';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper from '../../src/e2e-helper/e2e-helper';
import ComponentNotFoundInPath from '../../src/consumer/component/exceptions/component-not-found-in-path';
import { IgnoredDirectory } from '../../src/consumer/component-ops/add-components/exceptions/ignored-directory';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

describe('component files are missing', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('component directory were deleted', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.fixtures.populateComponents(1);
      helper.command.status(); // warm the cache
      helper.fs.deletePath('comp1');
    });
    it('bit list should not throw an error', () => {
      expect(() => helper.command.listLocalScope()).to.not.throw();
    });
    it('bit status should show the issue without throwing an error', () => {
      const status = helper.command.statusJson();
      expect(status.invalidComponents).to.have.lengthOf(1);
      expect(status.invalidComponents[0].error.name).to.equal(ComponentNotFoundInPath.name);

      // run the same thing again, to make sure the cache doesn't change the error message
      const status2 = helper.command.statusJson();
      expect(status2.invalidComponents).to.have.lengthOf(1);
      expect(status2.invalidComponents[0].error.name).to.equal(ComponentNotFoundInPath.name);
    });
  });
  describe('component files were deleted', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.fixtures.populateComponents(1);
      helper.command.status(); // warm the cache
      helper.fs.deletePath('comp1/index.js');
    });
    it('bit list should not throw an error', () => {
      expect(() => helper.command.listLocalScope()).to.not.throw();
    });
    it('bit status should show the issue without throwing an error', () => {
      const status = helper.command.statusJson();
      expect(status.invalidComponents).to.have.lengthOf(1);
      expect(status.invalidComponents[0].error.name).to.equal(ComponentNotFoundInPath.name);

      // run the same thing again, to make sure the cache doesn't change the error message
      const status2 = helper.command.statusJson();
      expect(status2.invalidComponents).to.have.lengthOf(1);
      expect(status2.invalidComponents[0].error.name).to.equal(ComponentNotFoundInPath.name);
    });
  });
  describe('component directory is ignored by .gitignore', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.fixtures.populateComponents(1);
      helper.command.status(); // warm the cache
      helper.fs.outputFile('.gitignore', 'comp1');
    });
    it('bit list should not throw an error', () => {
      expect(() => helper.command.listLocalScope()).to.not.throw();
    });
    it('bit status should show the issue without throwing an error', () => {
      const status = helper.command.statusJson();
      expect(status.invalidComponents).to.have.lengthOf(1);
      expect(status.invalidComponents[0].error.name).to.equal(IgnoredDirectory.name);

      // run the same thing again, to make sure the cache doesn't change the error message
      const status2 = helper.command.statusJson();
      expect(status2.invalidComponents).to.have.lengthOf(1);
      expect(status2.invalidComponents[0].error.name).to.equal(IgnoredDirectory.name);
    });
  });
});
