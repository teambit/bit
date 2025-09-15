import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';

chai.use(chaiFs);

// todo: fix after merging #9359
describe.skip('mix use of Legacy and Harmony', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('legacy component into Harmony workspace', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      const remoteName = '14epy6hr-remote';
      const remotePath = helper.scopeHelper.getNewBareScopeWithSpecificName(remoteName);
      helper.scopeHelper.addRemoteScope(remotePath);
      helper.scopes.setRemoteScope(undefined, undefined, remoteName);
      helper.fixtures.extractCompressedFixture('scopes/legacy-remote.tgz', helper.scopes.e2eDir);
    });
    it('should block importing the component', () => {
      expect(() => helper.command.importComponent('bar/foo@0.0.1')).to.throw('unable to write component');
    });
  });
});
