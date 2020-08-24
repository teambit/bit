import chai, { expect } from 'chai';

import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('default scope functionality', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('basic flow', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithThreeComponentsAndModulePath();
      helper.bitJson.addDefaultScope();
      helper.command.runCmd('bit link');
    });
    it('bit status should not break', () => {
      const status = helper.command.statusJson();
      expect(status.newComponents).have.lengthOf(3);
      expect(status.invalidComponents).have.lengthOf(0);
    });
    describe('tagging the components', () => {
      let tagOutput;
      before(() => {
        tagOutput = helper.command.tagAllComponents();
      });
      it('should be able to to tag them successfully', () => {
        expect(tagOutput).to.have.string('tagged');
      });
      it('bit status should not show any issue', () => {
        const status = helper.command.statusJson();
        expect(status.stagedComponents).have.lengthOf(3);
        expect(status.newComponents).have.lengthOf(0);
        expect(status.modifiedComponent).have.lengthOf(0);
        expect(status.invalidComponents).have.lengthOf(0);
      });
      describe('exporting the components', () => {
        before(() => {
          helper.command.exportAllComponents();
        });
        it('should be able to export them all successfully', () => {
          const status = helper.command.statusJson();
          expect(status.stagedComponents).have.lengthOf(0);
          expect(status.newComponents).have.lengthOf(0);
          expect(status.modifiedComponent).have.lengthOf(0);
          expect(status.invalidComponents).have.lengthOf(0);
        });
      });
    });
  });
});
