import { expect } from 'chai';

import Helper from '../../src/e2e-helper/e2e-helper';

describe('bit list command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('list before running "bit init" with .bit.map.json', () => {
    it('Should init consumer add then list component', () => {
      helper.bitMap.create();
      helper.fs.createFile('bar', 'foo.js');
      const output = helper.command.listLocalScope();
      expect(output.includes('found 0 components')).to.be.true;
    });
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
      helper.fixtures.addComponentBarFoo();
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
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
    });
    it('should display "found 1 components"', () => {
      const output = helper.command.listLocalScope();
      expect(output.includes('found 1 components')).to.be.true;
    });
    it('should list deprecated component', () => {
      helper.command.deprecateComponent('bar/foo');
      const output = helper.command.listLocalScope();
      expect(output).to.have.string('bar/foo [Deprecated]');
    });
  });
  describe('with --outdated flag', () => {
    describe('when a remote component has a higher version than the local component', () => {
      let output;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFoo();
        helper.fixtures.tagComponentBarFoo();
        helper.command.exportAllComponents();
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo@0.0.1');
        const clonedScopePath = helper.scopeHelper.cloneLocalScope();

        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo@0.0.1');
        helper.command.tagComponent('bar/foo', 'msg', '-f');
        helper.command.exportAllComponents();

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
        helper.command.addComponent('bar/baz.js', { i: 'bar/baz' });
        helper.command.tagComponent('bar/baz');
        helper.command.exportAllComponents();
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
        helper.scopeHelper.reInitLocalScope();
        helper.fs.createFile('bar', 'local');
        helper.command.addComponent('bar/local', { i: 'bar/local' });
        helper.command.tagComponent('bar/local');
        output = helper.command.listLocalScopeParsed('-o');
      });
      it('should show that the component does not have a remote version', () => {
        const barLocal = output.find((item) => item.id === 'bar/local');
        expect(barLocal.remoteVersion).to.equal('N/A');
      });
    });
  });
});
