import path from 'path';
import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('uninstall command', function () {
  let helper: Helper;
  this.timeout(0);
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('root policies removed', function () {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.command.install('is-positive@1.0.0 is-negative@1.0.0 is-odd@1.0.0');
      helper.command.uninstall('is-positive is-negative');
    });
    it('should remove packages from node_modules that were uninstalled', function () {
      expect(path.join(helper.fixtures.scopes.localPath, 'node_modules/is-positive')).to.not.be.a.path();
      expect(path.join(helper.fixtures.scopes.localPath, 'node_modules/is-negative')).to.not.be.a.path();
    });
    it('should not remove packages from node_modules that were not uninstalled', function () {
      expect(path.join(helper.fixtures.scopes.localPath, 'node_modules/is-odd')).to.be.a.path();
    });
  });
});
