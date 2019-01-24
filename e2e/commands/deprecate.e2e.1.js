import { expect } from 'chai';
import path from 'path';
import Helper from '../e2e-helper';

describe('bit deprecate command', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('with local scope and corrupted bit.json', () => {
    let output;
    before(() => {
      helper.initNewLocalScope();
    });
    it('Should not deprecate component if bit.json is corrupted', () => {
      helper.corruptBitJson();
      try {
        helper.deprecateComponent('bar/foo2');
      } catch (err) {
        output = err.toString();
      }
      expect(output).to.include('error: invalid bit.json: ');
      expect(output).to.include(`${path.join(helper.localScopePath, 'bit.json')}`);
    });
  });
  describe('with local scope and tagged components', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();
      output = helper.deprecateComponent('bar/foo');
    });
    it('should show deprecated component', () => {
      expect(output).to.have.string('deprecated components: bar/foo');
    });
    it('should list components with deprecated components', () => {
      const listOutput = helper.listLocalScope();
      expect(listOutput).to.contain.string('bar/foo [Deprecated]');
    });
    it('should export component as deprecated ', () => {
      helper.deprecateComponent('bar/foo');
      helper.exportAllComponents();
      output = helper.listRemoteScope(false);
      expect(output).to.contain.string('bar/foo');
      expect(output).to.contain.string('[Deprecated]');
    });
  });
  describe('with remote scope', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();
      helper.exportAllComponents();
      output = helper.deprecateComponent(`${helper.remoteScope}/bar/foo`, '-r');
    });
    it('should deprecate remote component ', () => {
      expect(output).to.contain.string(`deprecated components: ${helper.remoteScope}/bar/foo`);
    });
    it('should list components all components including deprecated from remote scope', () => {
      const listOutput = helper.listRemoteScope(false);
      expect(listOutput).to.contain.string('bar/foo');
      expect(listOutput).to.contain.string('[Deprecated]');
    });
    it('should not deprecate remote component if not found ', () => {
      const depOutput = helper.deprecateComponent(`${helper.remoteScope}/bar/foo111`, '-r');
      expect(depOutput).to.contain.string(`missing components: ${helper.remoteScope}/bar/foo`);
    });
  });
  describe('with remote scope with dependencies', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createFile('utils', 'is-type.js', isTypeFixture);
      helper.addComponentUtilsIsType();
      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createFile('utils', 'is-string.js', isStringFixture);
      helper.addComponentUtilsIsString();
      helper.tagAllComponents();
      helper.exportAllComponents();
    });
    it('should deprecate component that is being used by other components', () => {
      const output = helper.deprecateComponent(`${helper.remoteScope}/utils/is-type`, '-r');
      expect(output).to.contain.string(`deprecated components: ${helper.remoteScope}/utils/is-type`);
    });
  });
});
