import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

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
      helper.scopeHelper.setWorkspaceWithRemoteScope({ addRemoteScopeAsDefaultScope: false });
      helper.command.create('express-server', 'my-app', '--env teambit.harmony/node');
      helper.command.compile();
      helper.command.install();
      helper.workspaceJsonc.addKeyVal('my-scope/my-app', {});
    });
    // previously, it was supporting only app-name
    // TODO: temporary skip this test, the run with kill is hanging on CI, need to resolve it
    it.skip('should support app-id', async () => {
      const output = await helper.command.runWithKill('bit app run my-scope/my-app', undefined, 6000);
      expect(output).to.have.string('my-scope/my-app app is running on');
    });
  });
});
