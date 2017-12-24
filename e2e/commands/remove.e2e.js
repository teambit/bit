import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../e2e-helper';

chai.use(require('chai-fs'));

const assert = chai.assert;

describe.only('bit remove command', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('with local scope and corrupted bit.json', () => {
    before(() => {
      helper.initNewLocalScope();
    });
    it('Should not remove component if bit.json is corrupted', () => {
      helper.corruptBitJson();
      const removeCmd = () => helper.removeComponent('bar/foo2');
      expect(removeCmd).to.throw(
        'error: invalid bit.json: SyntaxError: Unexpected token o in JSON at position 1 is not a valid JSON file.'
      );
    });
  });
  describe('with commited components and -t=false ', () => {
    let output;
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      output = helper.removeComponent('bar/foo');
    });
    it('should remove component', () => {
      expect(output).to.contain.string('removed components: bar/foo');
    });
    it('should not show in bitmap', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap).to.not.have.property('bar/foo');
    });
    it('removed component should not be in new component when checking status', () => {
      const listOutput = helper.listLocalScope();
      expect(listOutput).to.not.contain.string('bar/foo');
      const status = helper.runCmd('bit status');
      expect(status.includes('bar/foo')).to.be.false;
    });
  });
  describe('local component with dependent', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');

      const isStringFixture = "const a = require('./is-type');";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      helper.commitAllComponents();
      output = helper.removeComponent('utils/is-string', '-d');
    });
    it('should remove local component', () => {
      expect(output).to.contain.string('removed components: utils/is-string');
    });
    it('should remove local component files from fs', () => {
      assert.notPathExists(path.join(helper.localScopePath, 'utils', 'is-string.js'), 'file should not exist');
    });
    it('should not remove local component dependent files from fs', () => {
      assert.pathExists(path.join(helper.localScopePath, 'utils', 'is-type.js'), 'file should  exist');
    });
  });
  describe('with commited components and -t=true', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.removeComponent('bar/foo', '-t');
    });
    it('should  show in bitmap', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo');
    });
    it('removed component should  be in new component', () => {
      const listOutput = helper.listLocalScope();
      expect(listOutput).to.not.contain.string('bar/foo');
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
      const output = helper.removeComponent(`${helper.remoteScope}/bar/foo`);
      expect(output).to.contain.string(`removed components: ${helper.remoteScope}/bar/foo`);
    });
  });
  describe('with remote scope with dependencies', () => {
    const componentName = 'utils/is-type';
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
      const output = helper.removeComponent(`${helper.remoteScope}/${componentName}`);
      expect(output).to.contain.string(
        `error: unable to delete ${helper.remoteScope}/${componentName}, because the following components depend on it:`
      );
    });
    it('should  remove component with dependencies when -f flag is true', () => {
      const output = helper.removeComponent(`${helper.remoteScope}/${componentName}`, '-f');
      expect(output).to.contain.string(`removed components: ${helper.remoteScope}/${componentName}`);
    });
  });
  describe('with imported components , no dependecies', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      // export a new simple component
      helper.createComponent('global', 'simple.js');
      helper.addComponent(path.normalize('global/simple.js'));
      helper.commitComponent('global/simple');
      helper.exportComponent('global/simple');

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('global/simple');
    });
    it('should not remove component with dependencies when -f flag is false', () => {
      const output = helper.removeComponent(`${helper.remoteScope}/global/simple`);
      expect(output).to.contain.string(`removed components: ${helper.remoteScope}/global/simple`);
      const bitMap = helper.readBitMap();
      expect(bitMap).to.not.have.property(`${helper.remoteScope}/global/simple`);
    });
  });

  describe('remove versions from local scope', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
    });
    it('should not remove component version when component is modified', () => {
      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      helper.commitAllComponents();
      helper.createComponent(
        'utils',
        'is-string.js',
        "module.exports = function isType() { return 'got is-type'; };console.log('sdfsdfsdf')"
      );
      const output = helper.removeComponent('utils/is-string@0.0.1');
      expect(output).to.contain.string('error: unable to remove modified components: utils/is-string@0.0.1');
    });
    it('should not remove component when component is modified', () => {
      const output = helper.removeComponent('utils/is-string');
      expect(output).to.contain.string('error: unable to remove modified components: utils/is-string');
    });
    it('should print error msg when trying to remove missing component', () => {
      helper.commitAllComponents();
      const output = helper.removeComponent('utils/is-string@0.0.10');
      expect(output).to.contain.string('missing components: utils/is-string@0.0.10');
      helper.commitAllComponents();
    });
    it('should remove component version only', () => {
      const output = helper.removeComponent('utils/is-string@0.0.2');
      expect(output).to.contain.string('successfully removed components: utils/is-string@0.0.2');
    });
    it('should display version 0.0.1 for component', () => {
      const output = JSON.parse(helper.listLocalScope('-j'));
      expect(output).to.deep.includes({ id: 'utils/is-string', localVersion: '0.0.1' });
    });
    it('should still be in bitmap', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('utils/is-string');
    });
    it('should remove entire component if specified version is the only one', () => {
      const output = helper.removeComponent('utils/is-string@0.0.1', '-f');
      expect(output).to.contain.string('successfully removed components: utils/is-string');
      const bitMap = helper.readBitMap();
      expect(bitMap).to.not.have.property('utils/is-string');
    });
  });
  describe('remove versions from remote scope', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');

      helper.createComponent('copy', 'is-type.js', isTypeFixture);
      helper.addComponent('copy/is-type.js');

      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      helper.commitAllComponents();
      helper.createComponent(
        'utils',
        'is-string.js',
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };console.log('sdfsdfsdf')'"
      );
      helper.commitAllComponents();
      helper.exportAllComponents();
    });
    it('should remove component version only', () => {
      const output = helper.removeComponent(`${helper.remoteScope}/utils/is-string@0.0.2`);
      expect(output).to.contain.string(`successfully removed components: ${helper.remoteScope}/utils/is-string@0.0.2`);
    });
    it('should display version 0.0.1 for component', () => {
      const output = helper.listRemoteScope(true);
      expect(output).to.contain.string(`${helper.remoteScope}/utils/is-string@0.0.1`);
    });
    it('should remove entire component if specified version is the only one', () => {
      const output = helper.removeComponent(`${helper.remoteScope}/utils/is-string@0.0.1`);
      expect(output).to.contain.string(`successfully removed components: ${helper.remoteScope}/utils/is-string`);
      const listOutput = helper.listRemoteScope(true);
      expect(listOutput).to.not.contain.string(`${helper.remoteScope}/utils/is-string`);
      expect(listOutput).to.contain.string(`${helper.remoteScope}/utils/is-type`);
    });
    it('should import component with same hash of component that was deleted', () => {
      const output = helper.importComponent('copy/is-type');
      expect(output.includes('successfully imported one component')).to.be.true;
      expect(output.includes('copy/is-type')).to.be.true;
    });
    it('2 components with same file hash should still work if one component is deleted', () => {
      const output = helper.removeComponent(`${helper.remoteScope}/copy/is-type`);
      expect(output).to.contain.string(`successfully removed components: ${helper.remoteScope}/copy/is-type`);
      const listOutput = helper.listRemoteScope(true);
      expect(listOutput).to.contain.string(`${helper.remoteScope}/utils/is-type`);
    });
  });
  describe.only('delete components with same file hash', () => {
    const helper2 = new Helper();

    before(() => {
      helper2.setNewLocalAndRemoteScopes();
      helper.setNewLocalAndRemoteScopes();
      helper.addRemoteScope(helper2.remoteScopePath, helper.remoteScopePath);
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');

      let isStringFixture = "const a = require('./is-type');";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');

      const isString2Fixture = "const a = require('./is-type');";
      helper.createComponent('utils', 'is-string2.js', isString2Fixture);
      helper.addComponent('utils/is-string2.js');

      helper.commitAllComponents();

      isStringFixture = "console.log('sdfdsf');";
      helper.createComponent('utils', 'is-string.js', isStringFixture);

      helper.commitAllComponents();
      helper.addRemoteScope(helper2.remoteScopePath, helper.localScopePath);
      helper.exportComponent('utils/is-type', helper2.remoteScope);
      helper.exportComponent('utils/is-string');
      helper.exportComponent('utils/is-string2');
    });
    it('should remove component version only', () => {
      const output = helper.removeComponent(`${helper.remoteScope}/utils/is-string@0.0.1`);
      expect(output).to.contain.string(`successfully removed components: ${helper.remoteScope}/utils/is-string@0.0.1`);
    });
    it('should import component is-string with no issues', () => {
      helper.reInitLocalScope();
      helper.addRemoteScope();
      const output = helper.importComponent('utils/is-string');
      expect(output.includes('successfully imported one component')).to.be.true;
    });
    it('should import component is-string2 with no issues', () => {
      helper.reInitLocalScope();
      helper.addRemoteScope();
      const output = helper.importComponent('utils/is-string2');
      expect(output.includes('successfully imported one component')).to.be.true;
    });
    it('should remove imported component and its files', () => {
      const importedComponentDir = path.join(helper.localScopePath, 'components', 'utils');
      const importedDependeceDir = path.join(
        helper.localScopePath,
        'components',
        '.dependencies',
        'utils',
        'is-type',
        helper2.remoteScope
      );

      const output = helper.removeComponent('utils/is-string2');
      expect(output).to.contain.string(`successfully removed components: ${helper.remoteScope}/utils/is-string2`);
      assert.isEmptyDirectory(importedComponentDir, 'directory not empty');
      assert.isEmptyDirectory(importedDependeceDir, 'directory not empty');
    });
    it('bitmap should not contain component and dependences', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap).to.not.have.property(`${helper.remoteScope}/utils/is-string2`);
      expect(bitMap).to.not.have.property(`${helper2.remoteScope}/utils/is-type`);
    });
  });
});
