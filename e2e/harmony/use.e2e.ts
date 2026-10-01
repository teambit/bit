import { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

describe('bit use command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('when the aspect is new', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.createAspect('my-aspect');
    });
    it('should not throw an error', () => {
      expect(() => helper.command.use(`${helper.scopes.remote}/my-aspect`)).to.not.throw();
    });
  });
});
