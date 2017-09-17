import { expect } from 'chai';
import Helper from '../e2e-helper';

describe('bit deprecate command', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('with local scope and commited components', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
    });
    it('should show deprecated component', () => {
      const output = helper.deprecateComponent('bar/foo');
      expect(output).to.have.string('deprecated components: bar/foo');
    });
    it('should list components with deprecated components', () => {
      helper.deprecateComponent('bar/foo');
      const output = helper.listLocalScope('bar/foo');
      expect(output).to.contain.string('bar/foo [Deprecated]');
    });
    it('should export component as deprecated ', () => {
      helper.deprecateComponent(`${helper.remoteScope}/bar/foo`);
      helper.exportAllComponents();
      const output = helper.listRemoteScope(false);
      expect(output).to.contain.string('bar/foo [Deprecated]');
    });
  });
  describe('with remote scope', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.exportAllComponents();
    });
    it('should deprecate remote component ', () => {
      const output = helper.deprecateComponent(`${helper.remoteScope}/bar/foo`, '-r');
      expect(output).to.contain.string(`deprecated components: ${helper.remoteScope}/bar/foo`);
    });
    it('should list components all components including deprecated from remote scope', () => {
      helper.deprecateComponent(`${helper.remoteScope}/bar/foo`, '-r');
      const output = helper.listRemoteScope(false);
      expect(output).to.contain.string('bar/foo [Deprecated]');
    });
    it('should not deprecate remote component if not found ', () => {
      const output = helper.deprecateComponent(`${helper.remoteScope}/bar/foo111`, '-r');
      expect(output).to.contain.string(`missing components: ${helper.remoteScope}/bar/foo`);
    });
  });
  describe('with remote scope with dependencies', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      helper.commitAllComponents();
      helper.exportAllComponents();
    });
    it('should deprecate component that is being used by other components', () => {
      const output = helper.deprecateComponent(`${helper.remoteScope}/utils/is-type`, '-r');
      expect(output).to.contain.string(`deprecated components: ${helper.remoteScope}/utils/is-type`);
    });
  });
});
