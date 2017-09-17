import { expect } from 'chai';
import Helper from '../e2e-helper';

describe('bit remove command', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('with local scope and commited components', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
    });
    it('should remove component', () => {
      const output = helper.removeComponent('bar/foo');
      expect(output).to.contain.string('removed components: bar/foo');
    });
    it('should removed component from commited components back to new', () => {
      helper.removeComponent('bar/foo');
      const output = helper.listLocalScope('bar/foo');
      expect(output).to.not.contain.string('bar/foo');

      const status = helper.runCmd('bit status');
      expect(status.includes('new components')).to.be.true;
      expect(status.includes('bar/foo')).to.be.true;
    });
  });
  describe('with remote scope without dependencies', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.exportAllComponents();
    });
    it('should remove remote component', () => {
      const output = helper.removeComponent(`${helper.remoteScope}/bar/foo`, '-r');
      expect(output).to.contain.string(`removed components: ${helper.remoteScope}/bar/foo`);
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
    it('should not remove component with dependencies when -f flag is false', () => {
      const output = helper.removeComponent(`${helper.remoteScope}/utils/is-type`, '-r');
      expect(output).to.contain.string(
        `error: unable to delete ${helper.remoteScope}/utils/is-type, because the following components depend on it:`
      );
    });
    it('should not remove component with dependencies when -f flag is true', () => {
      const output = helper.removeComponent(`${helper.remoteScope}/utils/is-type`, '-rf');
      expect(output).to.contain.string(`removed components: ${helper.remoteScope}/utils/is-type`);
    });
  });
});
