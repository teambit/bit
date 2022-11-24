import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('app command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('app run', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes({ addRemoteScopeAsDefaultScope: false });
      helper.command.create('express-app', 'my-app');
      helper.command.compile();
      helper.command.install();
      helper.bitJsonc.addKeyVal('my-scope/my-app', {});
    });
    // previously, it was supporting only app-name
    it('should support app-id', () => {
      const output = helper.general.runWithTryCatch('bit app run my-scope/my-app');
      expect(output).to.have.string('my-scope/my-app app is running on');
    });
  });
});
