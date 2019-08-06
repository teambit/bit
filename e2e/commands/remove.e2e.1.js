import chai, { expect } from 'chai';
import path from 'path';
import * as fixtures from '../fixtures/fixtures';
import Helper from '../e2e-helper';

chai.use(require('chai-fs'));

const assert = chai.assert;

describe('bit remove command', function () {
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
    it('Should not remove component if bit.json is corrupted', () => {
      helper.corruptBitJson();
      try {
        helper.removeComponent('bar/foo2');
      } catch (err) {
        output = err.toString();
      }
      expect(output).to.include('error: invalid bit.json: ');
      expect(output).to.include(`${path.join(helper.localScopePath, 'bit.json')}`);
    });
  });
  describe('with tagged components and --track=false ', () => {
    let output;
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();
      output = helper.removeComponent('bar/foo -s');
    });
    it('should remove component', () => {
      expect(output).to.contain.string('removed components');
      expect(output).to.contain.string('bar/foo');
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
  describe('local component with dependency', () => {
    let output;
    let scopeBeforeRemoving;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createFile('utils', 'is-type.js', isTypeFixture);
      helper.addComponentUtilsIsType();

      const isStringFixture = "const a = require('./is-type');";
      helper.createFile('utils', 'is-string.js', isStringFixture);
      helper.addComponentUtilsIsString();
      helper.tagAllComponents();
      scopeBeforeRemoving = helper.cloneLocalScope();
    });
    describe('removing the dependent', () => {
      before(() => {
        output = helper.removeComponent('utils/is-string', '--delete-files --silent');
      });
      it('should remove local component', () => {
        expect(output).to.contain.string('removed components');
        expect(output).to.contain.string('utils/is-string');
      });
      it('should remove local component files from fs', () => {
        assert.notPathExists(path.join(helper.localScopePath, 'utils', 'is-string.js'), 'file should not exist');
      });
      it('should not remove local component dependent files from fs', () => {
        assert.pathExists(path.join(helper.localScopePath, 'utils', 'is-type.js'), 'file should  exist');
      });
    });
    describe('removing the dependent from an inner directory', () => {
      before(() => {
        helper.getClonedLocalScope(scopeBeforeRemoving);
        output = helper.runCmd(
          'bit remove utils/is-string --delete-files --silent',
          path.join(helper.localScopePath, 'utils')
        );
      });
      it('should remove local component', () => {
        expect(output).to.contain.string('removed components');
        expect(output).to.contain.string('utils/is-string');
      });
      it('should remove local component files from fs', () => {
        assert.notPathExists(path.join(helper.localScopePath, 'utils', 'is-string.js'), 'file should not exist');
      });
      it('should not remove local component dependent files from fs', () => {
        assert.pathExists(path.join(helper.localScopePath, 'utils', 'is-type.js'), 'file should  exist');
      });
    });
  });
  describe('with tagged components and -t=true', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();
      helper.removeComponent('bar/foo', '-t -s');
    });
    it('should  show in bitmap', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo@0.0.1');
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
      helper.tagComponentBarFoo();
      helper.exportAllComponents();
    });
    describe('without --remote flag', () => {
      let output;
      before(() => {
        output = helper.removeComponent(`${helper.remoteScope}/bar/foo -s`);
      });
      it('should show a successful message', () => {
        expect(output).to.contain.string('removed components');
        expect(output).to.contain.string(`${helper.remoteScope}/bar/foo`);
      });
      it('should remove the component from the local scope', () => {
        const lsScope = helper.listLocalScope();
        expect(lsScope).to.have.string('found 0 components');
      });
      it('should not remove the component from the remote scope', () => {
        const lsScope = helper.listRemoteScope();
        expect(lsScope).to.not.have.string('found 0 components');
      });
    });
    describe('with --remote flag', () => {
      let output;
      before(() => {
        output = helper.removeComponent(`${helper.remoteScope}/bar/foo --remote -s`);
      });
      it('should show a successful message', () => {
        expect(output).to.contain.string(`removed components from the remote scope: ${helper.remoteScope}/bar/foo`);
      });
      it('should remove the component from the remote scope', () => {
        const lsScope = helper.listRemoteScope();
        expect(lsScope).to.have.string('found 0 components');
      });
    });
  });
  describe('with remote scope with dependencies', () => {
    const componentName = 'utils/is-type';
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
    it('should not remove component with dependencies when -f flag is false', () => {
      const output = helper.removeComponent(`${helper.remoteScope}/${componentName} -s`);
      expect(output).to.contain.string(
        `error: unable to delete ${helper.remoteScope}/${componentName}, because the following components depend on it:`
      );
    });
    it('should  remove component with dependencies when -f flag is true', () => {
      const output = helper.removeComponent(`${helper.remoteScope}/${componentName}`, '-f -s');
      expect(output).to.contain.string('removed components');
      expect(output).to.contain.string(`${helper.remoteScope}/${componentName}`);
    });
  });
  describe('with imported components, no dependencies', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      // export a new simple component
      helper.createFile('global', 'simple.js');
      helper.addComponent('global/simple.js', { i: 'global/simple' });
      helper.tagComponent('global/simple');
      helper.exportComponent('global/simple');

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('global/simple');
    });
    it('should remove components with no dependencies when -f flag is false', () => {
      const output = helper.removeComponent(`${helper.remoteScope}/global/simple -s`);
      expect(output).to.contain.string('removed components');
      expect(output).to.contain.string(`${helper.remoteScope}/global/simple`);
      const bitMap = helper.readBitMap();
      expect(bitMap).to.not.have.property(`${helper.remoteScope}/global/simple`);
    });
  });
  describe('remove modified component', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createFile('utils', 'is-type.js', isTypeFixture);
      helper.addComponentUtilsIsType();
      helper.tagAllComponents();
      helper.createFile(
        'utils',
        'is-type.js',
        "module.exports = function isType() { return 'got is-type'; };console.log('sdfsdfsdf')"
      );
    });
    it('should not remove modified component ', () => {
      const output = helper.removeComponent('utils/is-type@0.0.1 -s');
      expect(output).to.contain.string('error: unable to remove modified components');
      expect(output).to.contain.string('utils/is-type');
    });
  });
  describe('with imported components, no dependencies and yarn workspace', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      // export a new simple component
      helper.createFile('global', 'simple.js');
      helper.addComponent('global/simple.js', { i: 'global/simple' });
      helper.tagComponent('global/simple');
      helper.exportComponent('global/simple');

      helper.reInitLocalScope();
      helper.manageWorkspaces();
      helper.addRemoteScope();
      helper.importComponent('global/simple -p ./test');
      helper.removeComponent('global/simple -s');
    });
    it('should  remove component from package.json that points to relative path', () => {
      const pkgJson = helper.readPackageJson();
      expect(pkgJson.dependencies).to.not.have.property(`@bit/${helper.remoteScope}.global.simple`);
    });
    it('should not remove component with dependencies when -f flag is false', () => {
      const pkgJson = helper.readPackageJson();
      expect(pkgJson.workspaces).to.not.include('test');
    });
  });
  describe.skip('remove versions from local scope', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createFile('utils', 'is-type.js', isTypeFixture);
      helper.addComponentUtilsIsType();
    });
    it('should not remove component version when component is modified', () => {
      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createFile('utils', 'is-string.js', isStringFixture);
      helper.addComponentUtilsIsString();
      helper.tagAllComponents();
      helper.createFile(
        'utils',
        'is-string.js',
        "module.exports = function isType() { return 'got is-type'; };console.log('sdfsdfsdf')"
      );
      const output = helper.removeComponent('utils/is-string@0.0.1 -s');
      expect(output).to.contain.string('error: unable to remove modified components');
      expect(output).to.contain.string('utils/is-string@0.0.1');
    });
    it('should not remove component when component is modified', () => {
      const output = helper.removeComponent('utils/is-string -s');
      expect(output).to.contain.string('error: unable to remove modified components');
      expect(output).to.contain.string('utils/is-string');
    });
    it('should print error msg when trying to remove missing component', () => {
      helper.tagAllComponents();
      const output = helper.removeComponent('utils/is-string@0.0.10 -s');
      expect(output).to.contain.string('missing components: utils/is-string@0.0.10');
      helper.tagAllComponents();
    });
    it('should remove component version only', () => {
      const output = helper.removeComponent('utils/is-string@0.0.2 -s');
      expect(output).to.contain.string('successfully removed components');
      expect(output).to.contain.string('utils/is-string@0.0.2');
    });
    it('should display version 0.0.1 for component', () => {
      const output = helper.listLocalScopeParsed();
      expect(output).to.deep.includes({ id: 'utils/is-string', localVersion: '0.0.1' });
    });
    it('should still be in bitmap', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('utils/is-string');
    });
    it('should remove entire component if specified version is the only one', () => {
      const output = helper.removeComponent('utils/is-string@0.0.1', '-f -s');
      expect(output).to.contain.string('successfully removed components');
      expect(output).to.contain.string('utils/is-string');
      const bitMap = helper.readBitMap();
      expect(bitMap).to.not.have.property('utils/is-string');
    });
  });
  describe.skip('remove versions from remote scope', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createFile('utils', 'is-type.js', isTypeFixture);
      helper.addComponentUtilsIsType();

      helper.createFile('copy', 'is-type.js', isTypeFixture);
      helper.addComponent('copy/is-type.js', { i: 'copy/is-type' });

      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createFile('utils', 'is-string.js', isStringFixture);
      helper.addComponentUtilsIsString();
      helper.tagAllComponents();
      helper.createFile(
        'utils',
        'is-string.js',
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };console.log('sdfsdfsdf')'"
      );
      helper.tagAllComponents();
      helper.exportAllComponents();
    });
    it('should remove component version only', () => {
      const output = helper.removeComponent(`${helper.remoteScope}/utils/is-string@0.0.2 -s`);
      expect(output).to.contain.string('successfully removed components');
      expect(output).to.contain.string(`${helper.remoteScope}/utils/is-string@0.0.2`);
    });
    it('should display version 0.0.1 for component', () => {
      const output = helper.listRemoteScope(true);
      expect(output).to.contain.string(`${helper.remoteScope}/utils/is-string@0.0.1`);
    });
    it('should remove entire component if specified version is the only one', () => {
      const output = helper.removeComponent(`${helper.remoteScope}/utils/is-string@0.0.1 -s`);
      expect(output).to.contain.string('successfully removed components');
      expect(output).to.contain.string(`${helper.remoteScope}/utils/is-string`);
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
      const output = helper.removeComponent(`${helper.remoteScope}/copy/is-type -s`);
      expect(output).to.contain.string('successfully removed components');
      expect(output).to.contain.string(`${helper.remoteScope}/copy/is-type`);
      const listOutput = helper.listRemoteScope(true);
      expect(listOutput).to.contain.string(`${helper.remoteScope}/utils/is-type`);
    });
  });
  describe('delete components with same file hash', () => {
    const helper2 = new Helper();

    before(() => {
      helper2.setNewLocalAndRemoteScopes();
      helper.setNewLocalAndRemoteScopes();
      helper.addRemoteScope(helper2.remoteScopePath, helper.remoteScopePath);
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createFile('utils', 'is-type.js', isTypeFixture);
      helper.addComponentUtilsIsType();

      let isStringFixture = "const a = require('./is-type');";
      helper.createFile('utils', 'is-string.js', isStringFixture);
      helper.addComponentUtilsIsString();

      const isString2Fixture = "const a = require('./is-type');";
      helper.createFile('utils', 'is-string2.js', isString2Fixture);
      helper.addComponent('utils/is-string2.js', { i: 'utils/is-string2' });

      helper.tagAllComponents();

      isStringFixture = "console.log('sdfdsf');";
      helper.createFile('utils', 'is-string.js', isStringFixture);

      helper.tagAllComponents();
      helper.addRemoteScope(helper2.remoteScopePath, helper.localScopePath);
      helper.exportComponent('utils/is-type', helper2.remoteScope);
      helper.exportComponent('utils/is-string');
      helper.exportComponent('utils/is-string2');
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

      const output = helper.removeComponent('utils/is-string2 -s');
      expect(output).to.contain.string('successfully removed components');
      expect(output).to.contain.string(`${helper.remoteScope}/utils/is-string2`);
      expect(importedComponentDir).to.not.be.a.path();
      expect(importedDependeceDir).to.not.be.a.path();
    });
    it('bitmap should not contain component and dependences', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap).to.not.have.property(`${helper.remoteScope}/utils/is-string2`);
      expect(bitMap).to.not.have.property(`${helper2.remoteScope}/utils/is-type`);
    });

    it('should remove imported component from bit.json', () => {
      const bitJson = helper.readBitJson();
      expect(bitJson).to.not.have.property(`${helper.remoteScope}/utils/is-string2`);
    });
  });
  describe('remove a component when the main file is missing', () => {
    let output;
    before(() => {
      helper.reInitLocalScope();
      helper.createFile('bar', 'foo.js');
      helper.createFile('bar', 'foo-main.js');
      helper.addComponent('bar', { m: 'foo-main.js', i: 'bar/foo' });
      helper.tagAllComponents();
      helper.deletePath('bar/foo-main.js');
      const status = helper.status();
      expect(status).to.have.string('main-file was removed');
      output = helper.removeComponent('bar/foo -s');
    });
    it('should remove the component successfully', () => {
      expect(output).to.have.string('successfully removed component');
    });
  });
  describe('remove a component when a dependency has a file with the same content as other component file', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.addComponentUtilsIsType();
      helper.createFile('utils', 'is-string.js', fixtures.isString);
      helper.addComponentUtilsIsString();
      helper.createFile('utils', 'is-type2.js', fixtures.isType);
      helper.addComponent('utils/is-type2.js', { i: 'utils/is-type2' });
      helper.tagAllComponents();

      // this additional is to prevent another bug, where nested are imported only with their
      // latest version and then when 'bit remove' tries to remove all versions array of
      // ModelComponent, it doesn't find some of them and throws ENOENT error
      helper.tagScope('1.0.0');

      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-string');
      helper.importComponent('utils/is-type2');

      // now, the hash "b417426ea2f7f0e80fa2ee2e6c825e18fcb8a897", which has the content of fixtures.isType
      // is shared between two components: utils/is-type and utils/is-type2
      // deleting utils/is-string, causes removal of its dependency utils/is-type as well.
      // a previous bug, deleted also the files associated with utils/is-type, leaving utils/is-type2
      // with missing files from the scope.
      output = helper.removeComponent('utils/is-string -s');
    });
    it('should successfully remove', () => {
      expect(output).to.have.string('removed components');
    });
    it('bit status should not throw an error about missing file from the model', () => {
      const statusCmd = () => helper.status();
      expect(statusCmd).to.not.throw();
    });
    it('expect the shared hash to not be deleted', () => {
      const hashLocation = path.join(helper.localScopePath, '.bit/objects/b4/17426ea2f7f0e80fa2ee2e6c825e18fcb8a897');
      expect(hashLocation).to.be.a.file();
    });
  });
});
