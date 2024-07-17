import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.create('bit-aspect', 'my-aspect');
    });
    it('should not throw an error', () => {
      expect(() => helper.command.use(`${helper.scopes.remote}/my-aspect`)).to.not.throw();
    });
  });
});
