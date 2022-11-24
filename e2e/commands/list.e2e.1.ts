import { expect } from 'chai';

import Helper from '../../src/e2e-helper/e2e-helper';

describe('bit list command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('when no components created', () => {
    before(() => {
      helper.scopeHelper.clean();
      helper.scopeHelper.initWorkspace();
    });
    it('should display "found 0 components"', () => {
      const output = helper.command.listLocalScope();
      expect(output.includes('found 0 components')).to.be.true;
    });
  });
  describe('when a component is created but not tagged', () => {
    before(() => {
      helper.scopeHelper.clean();
      helper.scopeHelper.initWorkspace();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
    });
    it('should display "found 0 components"', () => {
      const output = helper.command.listLocalScope();
      expect(output.includes('found 0 components')).to.be.true;
    });
  });
  describe('when a component is created and tagged', () => {
    before(() => {
      helper.scopeHelper.clean();
      helper.scopeHelper.initWorkspace();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.fixtures.tagComponentBarFoo();
    });
    it('should display "found 1 components"', () => {
      const output = helper.command.listLocalScope();
      expect(output.includes('found 1 components')).to.be.true;
    });
  });
  describe('with --outdated flag', () => {
    describe('when a remote component has a higher version than the local component', () => {
      let output;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFooAsDir();
        helper.fixtures.tagComponentBarFoo();
        helper.command.export();
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo@0.0.1');
        const clonedScopePath = helper.scopeHelper.cloneLocalScope();

        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo@0.0.1');
        helper.command.tagComponent('bar/foo', 'msg', '-f');
        helper.command.export();

        helper.scopeHelper.getClonedLocalScope(clonedScopePath);
        output = helper.command.listLocalScopeParsed('-o');
      });
      it('should show that it has a later version in the remote', () => {
        const barFoo = output.find((item) => item.id === `${helper.scopes.remote}/bar/foo`);
        expect(barFoo.remoteVersion).to.equal('0.0.2');
        expect(barFoo.localVersion).to.equal('0.0.1');
      });
    });
    describe('when a remote component has the same version as the local component', () => {
      let output;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fs.createFile('bar', 'baz.js');
        helper.command.addComponent('bar', { i: 'bar/baz' });
        helper.command.tagWithoutBuild('bar/baz');
        helper.command.export();
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/baz@0.0.1');
        output = helper.command.listLocalScopeParsed('-o');
      });
      it('should display the same version for the local and remote', () => {
        const barBaz = output.find((item) => item.id === `${helper.scopes.remote}/bar/baz`);
        expect(barBaz.remoteVersion).to.equal(barBaz.localVersion);
      });
    });
    describe('when a component is local only (never exported)', () => {
      let output;
      before(() => {
        helper.scopeHelper.reInitLocalScope({ addRemoteScopeAsDefaultScope: false });
        helper.fs.createFile('bar', 'local');
        helper.command.addComponent('bar', { i: 'bar/local' });
        helper.command.tagWithoutBuild('bar/local');
        output = helper.command.listLocalScopeParsed('-o');
      });
      it('should show that the component does not have a remote version', () => {
        const barLocal = output.find((item) => item.id === 'my-scope/bar/local');
        expect(barLocal.remoteVersion).to.equal('N/A');
      });
    });
  });
});
