import { expect } from 'chai';

import Helper from '../../src/e2e-helper/e2e-helper';

describe('two components with the same name but different scope-name', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('importing from another scope', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.setScope(scopeName, 'bar/foo');
      helper.command.tagAllWithoutBuild();
      helper.command.tagIncludeUnmodified('0.0.2');
      helper.command.exportIds('bar/foo');

      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.command.runCmd(`bit import ${scopeName}/bar/foo --objects`);
    });
    it('bit status should show the component as new', () => {
      const status = helper.command.statusJson();
      expect(status.newComponents).to.have.lengthOf(1);
    });
  });
});
