import chai, { expect } from 'chai';
import * as path from 'path';

import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';

chai.use(require('chai-fs'));

const assert = chai.assert;

describe('bit remove command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('with local scope and corrupted bit.json', () => {
    let output;
    before(() => {
      helper.scopeHelper.initNewLocalScope();
    });
    it('Should not remove component if bit.json is corrupted', () => {
      helper.bitJson.corrupt();
      try {
        helper.command.removeComponent('bar/foo2');
      } catch (err) {
        output = err.toString();
      }
      expect(output).to.include('error: invalid bit.json: ');
      expect(output).to.include(`${path.join(helper.scopes.localPath, 'bit.json')}`);
    });
  });
  describe('with tagged components and --track=false ', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      output = helper.command.removeComponent('bar/foo');
    });
    it('should remove component', () => {
      expect(output).to.have.string('removed components');
      expect(output).to.have.string('bar/foo');
    });
    it('should not show in bitmap', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.not.have.property('bar/foo');
    });
    it('removed component should not be in new component when checking status', () => {
      const listOutput = helper.command.listLocalScope();
      expect(listOutput).to.not.have.string('bar/foo');
      const status = helper.command.runCmd('bit status');
      expect(status.includes('bar/foo')).to.be.false;
    });
  });
  describe('local component with dependency', () => {
    let output;
    let scopeBeforeRemoving;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithUtilsIsType();

      const isStringFixture = "const a = require('./is-type');";
      helper.fs.createFile('utils', 'is-string.js', isStringFixture);
      helper.fixtures.addComponentUtilsIsString();
      helper.command.tagAllComponents();
      scopeBeforeRemoving = helper.scopeHelper.cloneLocalScope();
    });
    describe('removing the dependent', () => {
      before(() => {
        output = helper.command.removeComponent('utils/is-string', '--delete-files');
      });
      it('should remove local component', () => {
        expect(output).to.have.string('removed components');
        expect(output).to.have.string('utils/is-string');
      });
      it('should remove local component files from fs', () => {
        assert.notPathExists(path.join(helper.scopes.localPath, 'utils', 'is-string.js'), 'file should not exist');
      });
      it('should not remove local component dependent files from fs', () => {
        assert.pathExists(path.join(helper.scopes.localPath, 'utils', 'is-type.js'), 'file should  exist');
      });
    });
    describe('removing the dependent from an inner directory', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeBeforeRemoving);
        output = helper.command.runCmd(
          'bit remove utils/is-string --delete-files --silent',
          path.join(helper.scopes.localPath, 'utils')
        );
      });
      it('should remove local component', () => {
        expect(output).to.have.string('removed components');
        expect(output).to.have.string('utils/is-string');
      });
      it('should remove local component files from fs', () => {
        assert.notPathExists(path.join(helper.scopes.localPath, 'utils', 'is-string.js'), 'file should not exist');
      });
      it('should not remove local component dependent files from fs', () => {
        assert.pathExists(path.join(helper.scopes.localPath, 'utils', 'is-type.js'), 'file should  exist');
      });
    });
  });
  describe('with tagged components and -t=true', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.command.removeComponent('bar/foo', '-t');
    });
    it('should  show in bitmap', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('bar/foo@0.0.1');
    });
    it('removed component should  be in new component', () => {
      const listOutput = helper.command.listLocalScope();
      expect(listOutput).to.not.have.string('bar/foo');
      const status = helper.command.runCmd('bit status');
      expect(status.includes('new components')).to.be.true;
      expect(status.includes('bar/foo')).to.be.true;
    });
  });
  describe('with remote scope without dependencies', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportAllComponents();
    });
    describe('without --remote flag', () => {
      let output;
      before(() => {
        output = helper.command.removeComponent(`${helper.scopes.remote}/bar/foo`);
      });
      it('should show a successful message', () => {
        expect(output).to.have.string('removed components');
        expect(output).to.have.string(`${helper.scopes.remote}/bar/foo`);
      });
      it('should remove the component from the local scope', () => {
        const lsScope = helper.command.listLocalScope();
        expect(lsScope).to.have.string('found 0 components');
      });
      it('should not remove the component from the remote scope', () => {
        const lsScope = helper.command.listRemoteScope();
        expect(lsScope).to.not.have.string('found 0 components');
      });
    });
    describe('with --remote flag', () => {
      let output;
      before(() => {
        output = helper.command.removeComponent(`${helper.scopes.remote}/bar/foo --remote`);
      });
      it('should show a successful message', () => {
        expect(output).to.have.string(`removed components from the remote scope: ${helper.scopes.remote}/bar/foo`);
      });
      it('should remove the component from the remote scope', () => {
        const lsScope = helper.command.listRemoteScope();
        expect(lsScope).to.have.string('found 0 components');
      });
    });
  });
  describe('with remote scope with dependencies', () => {
    const componentName = 'utils/is-type';
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fixtures.addComponentUtilsIsType();
      helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
      helper.fixtures.addComponentUtilsIsString();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
    });
    it('should not remove component with dependencies when -f flag is false', () => {
      const output = helper.command.removeComponent(`${helper.scopes.remote}/${componentName}`);
      expect(output).to.have.string(
        `error: unable to delete ${helper.scopes.remote}/${componentName}, because the following components depend on it:`
      );
    });
    it('should  remove component with dependencies when -f flag is true', () => {
      const output = helper.command.removeComponent(`${helper.scopes.remote}/${componentName}`, '-f');
      expect(output).to.have.string('removed components');
      expect(output).to.have.string(`${helper.scopes.remote}/${componentName}`);
    });
  });
  describe('with imported components, no dependencies', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      // export a new simple component
      helper.fs.createFile('global', 'simple.js');
      helper.command.addComponent('global/simple.js', { i: 'global/simple' });
      helper.command.tagComponent('global/simple');
      helper.command.exportComponent('global/simple');

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('global/simple');
    });
    it('should remove components with no dependencies when -f flag is false', () => {
      const output = helper.command.removeComponent(`${helper.scopes.remote}/global/simple`);
      expect(output).to.have.string('removed components');
      expect(output).to.have.string(`${helper.scopes.remote}/global/simple`);
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.not.have.property(`${helper.scopes.remote}/global/simple`);
    });
  });
  describe('remove modified component', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithUtilsIsType();
      helper.command.tagAllComponents();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isTypeV2);
    });
    it('should not remove modified component ', () => {
      const output = helper.command.removeComponent('utils/is-type@0.0.1');
      expect(output).to.have.string('error: unable to remove modified components');
      expect(output).to.have.string('utils/is-type');
    });
  });
  describe('with imported components, no dependencies and yarn workspace', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      // export a new simple component
      helper.fs.createFile('global', 'simple.js');
      helper.command.addComponent('global/simple.js', { i: 'global/simple' });
      helper.command.tagComponent('global/simple');
      helper.command.exportComponent('global/simple');

      helper.scopeHelper.reInitLocalScope();
      helper.bitJson.manageWorkspaces();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('global/simple -p ./test');
      helper.command.removeComponent('global/simple -s');
    });
    it('should remove component from package.json that points to relative path', () => {
      const pkgJson = helper.packageJson.read();
      expect(pkgJson.dependencies).to.not.have.property(`@bit/${helper.scopes.remote}.global.simple`);
    });
    it('should not remove component with dependencies when -f flag is false', () => {
      const pkgJson = helper.packageJson.read();
      expect(pkgJson.workspaces).to.not.include('test');
    });
  });
  describe.skip('remove versions from local scope', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithUtilsIsType();
    });
    it('should not remove component version when component is modified', () => {
      helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
      helper.fixtures.addComponentUtilsIsString();
      helper.command.tagAllComponents();
      helper.fs.createFile('utils', 'is-string.js', fixtures.isStringV2);
      const output = helper.command.removeComponent('utils/is-string@0.0.1');
      expect(output).to.have.string('error: unable to remove modified components');
      expect(output).to.have.string('utils/is-string@0.0.1');
    });
    it('should not remove component when component is modified', () => {
      const output = helper.command.removeComponent('utils/is-string');
      expect(output).to.have.string('error: unable to remove modified components');
      expect(output).to.have.string('utils/is-string');
    });
    it('should print error msg when trying to remove missing component', () => {
      helper.command.tagAllComponents();
      const output = helper.command.removeComponent('utils/is-string@0.0.10');
      expect(output).to.have.string('missing components: utils/is-string@0.0.10');
      helper.command.tagAllComponents();
    });
    it('should remove component version only', () => {
      const output = helper.command.removeComponent('utils/is-string@0.0.2');
      expect(output).to.have.string('successfully removed components');
      expect(output).to.have.string('utils/is-string@0.0.2');
    });
    it('should display version 0.0.1 for component', () => {
      const output = helper.command.listLocalScopeParsed();
      expect(output).to.deep.include({ id: 'utils/is-string', localVersion: '0.0.1' });
    });
    it('should still be in bitmap', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('utils/is-string');
    });
    it('should remove entire component if specified version is the only one', () => {
      const output = helper.command.removeComponent('utils/is-string@0.0.1', '-f');
      expect(output).to.have.string('successfully removed components');
      expect(output).to.have.string('utils/is-string');
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.not.have.property('utils/is-string');
    });
  });
  describe.skip('remove versions from remote scope', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithUtilsIsType();

      helper.fs.createFile('copy', 'is-type.js', fixtures.isType);
      helper.command.addComponent('copy/is-type.js', { i: 'copy/is-type' });

      helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
      helper.fixtures.addComponentUtilsIsString();
      helper.command.tagAllComponents();
      helper.fs.createFile('utils', 'is-string.js', fixtures.isStringV2);
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
    });
    it('should remove component version only', () => {
      const output = helper.command.removeComponent(`${helper.scopes.remote}/utils/is-string@0.0.2`);
      expect(output).to.have.string('successfully removed components');
      expect(output).to.have.string(`${helper.scopes.remote}/utils/is-string@0.0.2`);
    });
    it('should display version 0.0.1 for component', () => {
      const output = helper.command.listRemoteScope(true);
      expect(output).to.have.string(`${helper.scopes.remote}/utils/is-string@0.0.1`);
    });
    it('should remove entire component if specified version is the only one', () => {
      const output = helper.command.removeComponent(`${helper.scopes.remote}/utils/is-string@0.0.1`);
      expect(output).to.have.string('successfully removed components');
      expect(output).to.have.string(`${helper.scopes.remote}/utils/is-string`);
      const listOutput = helper.command.listRemoteScope(true);
      expect(listOutput).to.not.have.string(`${helper.scopes.remote}/utils/is-string`);
      expect(listOutput).to.have.string(`${helper.scopes.remote}/utils/is-type`);
    });
    it('should import component with same hash of component that was deleted', () => {
      const output = helper.command.importComponent('copy/is-type');
      expect(output.includes('successfully imported one component')).to.be.true;
      expect(output.includes('copy/is-type')).to.be.true;
    });
    it('2 components with same file hash should still work if one component is deleted', () => {
      const output = helper.command.removeComponent(`${helper.scopes.remote}/copy/is-type`);
      expect(output).to.have.string('successfully removed components');
      expect(output).to.have.string(`${helper.scopes.remote}/copy/is-type`);
      const listOutput = helper.command.listRemoteScope(true);
      expect(listOutput).to.have.string(`${helper.scopes.remote}/utils/is-type`);
    });
  });
  describe('delete components with same file hash', () => {
    let helper2;
    before(() => {
      helper2 = new Helper();
      helper2.command.setFeatures('legacy-workspace-config');
      helper2.scopeHelper.setNewLocalAndRemoteScopes();
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.scopeHelper.addRemoteScope(helper2.scopes.remotePath, helper.scopes.remotePath);
      helper.fixtures.populateWorkspaceWithUtilsIsType();

      let isStringFixture = "const a = require('./is-type');";
      helper.fs.createFile('utils', 'is-string.js', isStringFixture);
      helper.fixtures.addComponentUtilsIsString();

      const isString2Fixture = "const a = require('./is-type');";
      helper.fs.createFile('utils', 'is-string2.js', isString2Fixture);
      helper.command.addComponent('utils/is-string2.js', { i: 'utils/is-string2' });

      helper.command.tagAllComponents();

      isStringFixture = "console.log('sdfdsf');";
      helper.fs.createFile('utils', 'is-string.js', isStringFixture);

      helper.command.tagAllComponents();
      helper.scopeHelper.addRemoteScope(helper2.scopes.remotePath, helper.scopes.localPath);
      helper.command.exportComponent('utils/is-type', helper2.scopes.remote);
      helper.command.exportComponent('utils/is-string');
      helper.command.exportComponent('utils/is-string2');
    });
    it('should import component is-string with no issues', () => {
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      const output = helper.command.importComponent('utils/is-string');
      expect(output.includes('successfully imported one component')).to.be.true;
    });
    it('should import component is-string2 with no issues', () => {
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      const output = helper.command.importComponent('utils/is-string2');
      expect(output.includes('successfully imported one component')).to.be.true;
    });

    // TODO: check if this is necessary

    /*
    it('should remove imported component and its files', () => {
      const importedComponentDir = path.join(helper.scopes.localPath, 'components', 'utils');
      const importedDependeceDir = path.join(
        helper.scopes.localPath,
        'components',
        '.dependencies',
        'utils',
        'is-type',
        helper2.scopes.remote
      );

      const output = helper.command.removeComponent('utils/is-string2 -s');
      expect(output).to.have.string('successfully removed components');
      expect(output).to.have.string(`${helper.scopes.remote}/utils/is-string2`);
      expect(importedComponentDir).to.not.be.a.path();
      expect(importedDependeceDir).to.not.be.a.path();
    });
    */
    it('bitmap should not contain component and dependences', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.not.have.property(`${helper.scopes.remote}/utils/is-string2`);
      expect(bitMap).to.not.have.property(`${helper2.scopes.remote}/utils/is-type`);
    });

    it('should remove imported component from bit.json', () => {
      const bitJson = helper.bitJson.read();
      expect(bitJson).to.not.have.property(`${helper.scopes.remote}/utils/is-string2`);
    });
  });
  describe('remove a component when the main file is missing', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('bar', 'foo-main.js');
      helper.command.addComponent('bar', { m: 'foo-main.js', i: 'bar/foo' });
      helper.command.tagAllComponents();
      helper.fs.deletePath('bar/foo-main.js');
      const status = helper.command.status();
      expect(status).to.have.string('main-file was removed');
      output = helper.command.removeComponent('bar/foo');
    });
    it('should remove the component successfully', () => {
      expect(output).to.have.string('successfully removed component');
    });
  });
  describe('remove a component when a dependency has a file with the same content as other component file', () => {
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fixtures.addComponentUtilsIsType();
      helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
      helper.fixtures.addComponentUtilsIsString();
      helper.fs.createFile('utils', 'is-type2.js', fixtures.isType);
      helper.command.addComponent('utils/is-type2.js', { i: 'utils/is-type2' });
      helper.command.tagAllComponents();

      // this additional is to prevent another bug, where nested are imported only with their
      // latest version and then when 'bit remove' tries to remove all versions array of
      // ModelComponent, it doesn't find some of them and throws ENOENT error
      helper.command.tagScope('1.0.0');

      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('utils/is-string');
      helper.command.importComponent('utils/is-type2');

      // now, the hash "b417426ea2f7f0e80fa2ee2e6c825e18fcb8a897", which has the content of fixtures.isType
      // is shared between two components: utils/is-type and utils/is-type2
      // deleting utils/is-string, causes removal of its dependency utils/is-type as well.
      // a previous bug, deleted also the files associated with utils/is-type, leaving utils/is-type2
      // with missing files from the scope.
      output = helper.command.removeComponent('utils/is-string');
    });
    it('should successfully remove', () => {
      expect(output).to.have.string('removed components');
    });
    it('bit status should not throw an error about missing file from the model', () => {
      const statusCmd = () => helper.command.status();
      expect(statusCmd).to.not.throw();
    });
    it('expect the shared hash to not be deleted', () => {
      const hashLocation = path.join(helper.scopes.localPath, '.bit/objects/b4/17426ea2f7f0e80fa2ee2e6c825e18fcb8a897');
      expect(hashLocation).to.be.a.file();
    });
  });
});
