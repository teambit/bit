import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('workspace config (workspace.jsonc)', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('adding a non-component key', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.addKeyVal(undefined, 'non-comp', {});
    });
    it('any command should throw a descriptive error', () => {
      expect(() => helper.command.status()).to.throw(
        `unable to parse the component-id "non-comp" from the workspace.jsonc file`
      );
    });
  });
});
