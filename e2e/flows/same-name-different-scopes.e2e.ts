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
  describe('importing objects from another scope', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.setScope(scopeName, 'bar/foo');
      helper.command.tagAllWithoutBuild();
      helper.command.tagIncludeUnmodified('0.0.2');
      helper.command.exportIds('bar/foo');

      helper.scopeHelper.setNewLocalAndRemoteScopes();
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
  describe('importing and using both in the same workspace', () => {
    let anotherScopeName: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      anotherScopeName = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.setScope(scopeName, 'bar/foo');
      helper.command.tagWithoutBuild();
      helper.command.export();

      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.command.runCmd(`bit import ${scopeName}/bar/foo`);
    });
    it('bitmap should have both and the keys should contain the scope-name to differentiate', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property(`${helper.scopes.remote}/bar/foo`);
      expect(bitMap).to.have.property(`${anotherScopeName}/bar/foo`);
    });
    it('bit status should show the new component correctly', () => {
      const status = helper.command.statusJson();
      expect(status.newComponents).to.have.lengthOf(1);
      expect(status.newComponents[0]).to.equal(`${helper.scopes.remote}/bar/foo`);
    });
  });
});
