import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('bit stash command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('basic stash', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.tagAllWithoutBuild();
      helper.fixtures.populateComponents(1, undefined, 'v2');
      helper.command.stash();
    });
    it('should change the code to the last tag', () => {
      const content = helper.fs.readFile('comp1/index.js');
      expect(content).to.not.have.string('v2');
    });
    it('should create a stash-file', () => {
      const stashPath = path.join(helper.scopes.localPath, '.bit/stash/stash-1.json');
      expect(stashPath).to.be.a.file();
    });
    it('should checkout-reset the component', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponents).to.have.lengthOf(0);
    });
    describe('stash load', () => {
      before(() => {
        helper.command.stashLoad();
      });
      it('should return the code that was stashed before', () => {
        const content = helper.fs.readFile('comp1/index.js');
        expect(content).to.have.string('v2');
      });
      it('bit status should show the component as modified', () => {
        const status = helper.command.statusJson();
        expect(status.modifiedComponents).to.have.lengthOf(1);
      });
      it('should delete the stash file', () => {
        const stashPath = path.join(helper.scopes.localPath, '.bit/stash/stash-1.json');
        expect(stashPath).to.not.be.a.path();
      });
    });
  });
});
