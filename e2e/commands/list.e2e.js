import { expect } from 'chai';
import Helper from '../e2e-helper';

describe('bit list command', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('when no components created', () => {
    before(() => {
      helper.cleanEnv();
      helper.runCmd('bit init');
    });
    it('should display "found 0 components"', () => {
      const output = helper.runCmd('bit list');
      expect(output.includes('found 0 components')).to.be.true;
    });
  });
  describe('when a component is created but not committed', () => {
    before(() => {
      helper.cleanEnv();
      helper.runCmd('bit init');
      helper.createComponentBarFoo();
    });
    it('should display "found 0 components"', () => {
      const output = helper.runCmd('bit list');
      expect(output.includes('found 0 components')).to.be.true;
    });
  });
  describe('when a component is created and committed', () => {
    before(() => {
      helper.cleanEnv();
      helper.runCmd('bit init');
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
    });
    it('should display "found 1 components"', () => {
      const output = helper.runCmd('bit list');
      expect(output.includes('found 1 components')).to.be.true;
    });
    it('should list deprecated component', () => {
      helper.deprecateComponent('bar/foo');
      const output = helper.runCmd('bit list');
      expect(output).to.contain.string('bar/foo [Deprecated]');
    });
  });
  describe.only('with --outdated flag', () => {
    describe('when a remote component has a higher version than the local component', () => {
      let output;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createComponentBarFoo();
        helper.addComponentBarFoo();
        helper.commitComponentBarFoo();
        helper.exportAllComponents();
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo@1');
        const clonedScopePath = helper.cloneLocalScope();

        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo@1');
        helper.commitComponent('bar/foo', 'msg', '-f');
        helper.exportAllComponents();

        helper.getClonedLocalScope(clonedScopePath);
        const stringOutput = helper.runCmd('bit list -o -j');
        output = JSON.parse(stringOutput);
      });
      it('should show that it has a later version in the remote', () => {
        const barFoo = output.find(item => item.id === `${helper.remoteScope}/bar/foo`);
        expect(barFoo.remoteVersion).to.be.above(barFoo.localVersion);
      });
    });
    describe('when a remote component has the same version as the local component', () => {
      let output;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createComponent('bar/baz');
        helper.addComponent('bar/baz');
        helper.commitComponent('bar/baz');
        helper.exportAllComponents();
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/baz@1');
        const stringOutput = helper.runCmd('bit list -o -j');
        output = JSON.parse(stringOutput);
      });
      it('should display the same version for the local and remote', () => {
        const barBaz = output.find(item => item.id === `${helper.remoteScope}/bar/baz`);
        expect(barBaz.remoteVersion).to.equal(barBaz.localVersion);
      });
    });
    describe('when a component is local only (never exported)', () => {
      let output;
      before(() => {
        helper.reInitLocalScope();
        helper.createComponent('bar/local');
        helper.addComponent('bar/local');
        helper.commitComponent('bar/local');
        const stringOutput = helper.runCmd('bit list -o -j');
        output = JSON.parse(stringOutput);
      });
      it('should show that the component does not have a remote version', () => {
        const barLocal = output.find(item => item.id === 'bar/local');
        expect(barLocal.remoteVersion).to.equal('N/A');
      });
    });
  });
});
