import chai, { expect } from 'chai';
import chaiFs from 'chai-fs';
import chaiString from 'chai-string';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(chaiFs);
chai.use(chaiString);

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
      helper.command.create('bit-aspect', 'my-aspect');
    });
    it('should not throw an error', () => {
      expect(() => helper.command.use(`${helper.scopes.remote}/my-aspect`)).to.not.throw();
    });
  });
});
