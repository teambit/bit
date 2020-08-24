import { expect } from 'chai';

import Helper from '../../src/e2e-helper/e2e-helper';

describe('two components with the same name but different scope-name', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('importing from another scope', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.command.tagScope('0.0.2');
      helper.command.exportComponent('bar/foo', scopeName);

      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.command.runCmd(`bit import ${scopeName}/bar/foo --objects`);
    });
    it('bit status should show the component as new', () => {
      const status = helper.command.statusJson();
      expect(status.newComponents).to.have.lengthOf(1);
    });
  });
});
