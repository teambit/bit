import chai, { expect } from 'chai';
import detectIndent from 'detect-indent';
import fs from 'fs-extra';
import * as path from 'path';

import { BIT_GIT_DIR, BIT_HIDDEN_DIR, BIT_JSON, BIT_MAP, CURRENT_UPSTREAM } from '../../src/constants';
import { CURRENT_BITMAP_SCHEMA, SCHEMA_FIELD } from '../../src/consumer/bit-map/bit-map';
// import bitImportGitHook from '../../src/git-hooks/fixtures/bit-import-git-hook';
import { InvalidBitMap } from '../../src/consumer/bit-map/exceptions';
import { InvalidBitJson } from '../../src/consumer/config/exceptions';
import InvalidPackageJson from '../../src/consumer/config/exceptions/invalid-package-json';
import Helper from '../../src/e2e-helper/e2e-helper';

const assertArrays = require('chai-arrays');

chai.use(assertArrays);
chai.use(require('chai-fs'));

describe('run bit init', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('running bit init with path', () => {
    before(() => {
      helper.scopeHelper.cleanLocalScope();
      helper.command.runCmd('bit init my-dir');
    });
    it('should init Bit at that path', () => {
      expect(path.join(helper.scopes.localPath, 'my-dir/bit.json')).to.be.a.file();
    });
  });
  describe('automatic bit init when .bit.map.json already exists', () => {
    beforeEach(() => {
      helper.scopeHelper.reInitLocalScope();
    });
    before(() => {
      helper.bitMap.create();
    });
    it('should not tell you there is already a scope when running "bit init"', () => {
      const init = helper.scopeHelper.initLocalScope();
      expect(init).to.have.string('successfully initialized a bit workspace.');
    });
    it('should create bitmap"', () => {
      const bitmapPath = path.join(helper.scopes.localPath, '.bitmap');
      expect(bitmapPath).to.be.a.file('missing bitmap');
    });
    it('bitmap should contain version"', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property(SCHEMA_FIELD);
      expect(bitMap[SCHEMA_FIELD]).to.equal(CURRENT_BITMAP_SCHEMA);
    });
  });
  describe('default consumer bit.json', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
    });
    it('should not contain some default properties', () => {
      const bitJson = helper.bitJson.read();
      expect(bitJson).to.not.have.property('dist');
      expect(bitJson).to.not.have.property('extensions');
      expect(bitJson).to.not.have.property('dependenciesDirectory');
      expect(bitJson).to.not.have.property('saveDependenciesAsComponents');
      expect(bitJson).to.not.have.property('useWorkspaces');
      expect(bitJson).to.not.have.property('manageWorkspaces');
    });
  });
  describe('init .bit ', () => {
    describe('when .git exists and bit already initialized with .bit ', () => {
      it('should not create bit inside .git', () => {
        helper.scopeHelper.reInitLocalScope();
        helper.git.initNewGitRepo();
        helper.scopeHelper.initWorkspace();
        expect(path.join(helper.scopes.local, '.git', 'bit')).to.not.be.a.path('bit dir is missing');
      });
    });
  });
  describe('with custom configs', () => {
    let bitJson;
    before(() => {
      helper.scopeHelper.cleanLocalScope();
      helper.scopeHelper.initLocalScopeWithOptions({
        '-default-directory': 'my-comps',
        '-package-manager': 'yarn',
        // '-compiler': 'my-compiler',
        // '-tester': 'my-tester'
      });
      bitJson = helper.bitJson.read();
    });
    it('should set the default dir to my-comps', () => {
      expect(bitJson.componentsDefaultDirectory).to.equal('my-comps/{name}');
    });
    it('should set the package manager to yarn', () => {
      expect(bitJson.packageManager).to.equal('yarn');
    });
    // Disabled until supported by the new config
    it.skip('should set the compiler to my-compiler', () => {
      expect(bitJson.env.compiler).to.equal('my-compiler');
    });
    // Disabled until supported by the new config
    it.skip('should set the tester to my-tester', () => {
      expect(bitJson.env.tester).to.equal('my-tester');
    });
  });
  describe('git integration', () => {
    describe('when .git exists', () => {
      let gitFolder;
      // let gitHooksFolder;
      before(() => {
        helper.scopeHelper.cleanLocalScope();
        helper.git.initNewGitRepo();
        helper.scopeHelper.initLocalScope();
        gitFolder = path.join(helper.scopes.localPath, '.git');
        // gitHooksFolder = path.join(gitFolder, 'hooks');
      });

      it('should nest the bit folder inside .git by default', () => {
        const gitScopeDir = path.join(gitFolder, BIT_GIT_DIR);
        const scopeDir = path.join(helper.scopes.localPath, BIT_HIDDEN_DIR);
        expect(gitScopeDir).to.be.a.directory('bit dir is missing');
        // Use not.be.a.path instead of to.not.be.a.directory since for some reason it's not working
        expect(scopeDir).not.be.a.path('bit dir created not in the .git folder');
      });
      it('should not nest the bit folder inside .git if --standalone provided', () => {
        helper.scopeHelper.cleanLocalScope();
        helper.git.initNewGitRepo();
        helper.scopeHelper.initLocalScopeWithOptions({ '-standalone': '' });
        const gitScopeDir = path.join(gitFolder, BIT_GIT_DIR);
        const scopeDir = path.join(helper.scopes.localPath, BIT_HIDDEN_DIR);
        expect(scopeDir).to.be.a.directory('bit dir is missing');
        // Use not.be.a.path instead of to.not.be.a.directory since for some reason it's not working
        expect(gitScopeDir).not.be.a.path('bit dir created incorrectly (in .git folder)');
      });
      // it('should create git hooks', () => {
      //   helper.scopeHelper.cleanLocalScope();
      //   helper.git.initNewGitRepo();
      //   const output = helper.scopeHelper.initLocalScope();
      //   const hooksNames = GIT_HOOKS_NAMES.join(', ');
      //   expect(output).to.have.string(`the following git hooks were added: ${hooksNames}`);
      //   GIT_HOOKS_NAMES.forEach((hookName) => {
      //     const hookPath = path.join(gitHooksFolder, hookName);
      //     expect(hookPath)
      //       .to.be.a.file(`hook ${hookName} not found`)
      //       .with.content(bitImportGitHook, `hook ${hookName} has a wrong content`);
      //   });
      // });
      // it('should warn you if git hooks already exists and not override them', () => {
      //   helper.scopeHelper.cleanLocalScope();
      //   helper.git.initNewGitRepo();
      //   const hookContent = 'hook content';
      //   // helper.scopeHelper.initLocalScope();
      //   GIT_HOOKS_NAMES.forEach((hookName) => {
      //     helper.git.writeToGitHook(hookName, hookContent);
      //   });
      //   const output = helper.scopeHelper.initLocalScope();
      //   const hooksNames = GIT_HOOKS_NAMES.join(', ');
      //   expect(output).to.have.string(`warning: the following git hooks are already existing: ${hooksNames}`);
      //   GIT_HOOKS_NAMES.forEach((hookName) => {
      //     const hookPath = path.join(gitHooksFolder, hookName);
      //     expect(hookPath)
      //       .to.be.a.file(`hook ${hookName} not found`)
      //       .with.content(hookContent, `hook ${hookName} has a wrong content`);
      //   });
      // });
      // it('should not create git hooks if --standalone provided', () => {
      //   helper.scopeHelper.cleanLocalScope();
      //   helper.git.initNewGitRepo();
      //   const output = helper.scopeHelper.initLocalScopeWithOptions({ '-standalone': '' });
      //   expect(output).to.not.have.string('hooks');
      //   GIT_HOOKS_NAMES.forEach((hookName) => {
      //     const hookPath = path.join(gitHooksFolder, hookName);
      //     expect(hookPath).not.be.a.path(`hook ${hookName} created but it should not`);
      //   });
      // });
    });
  });
  describe('when scope.json is missing', () => {
    let scopeJsonPath;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      scopeJsonPath = path.join(helper.scopes.localPath, '.bit/scope.json');
      fs.removeSync(scopeJsonPath);
    });
    describe('running bit init', () => {
      let output;
      before(() => {
        output = helper.scopeHelper.initLocalScope();
      });
      it('should show a success message', () => {
        expect(output).to.have.string('successfully initialized');
      });
      it('should recreate scope.json file', () => {
        expect(scopeJsonPath).to.be.a.file();
      });
    });
  });
  describe('bit init --reset', () => {
    describe('when bitMap file is invalid', () => {
      let bitMapPath;
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        const invalidBitMap = 'this is an invalid json';
        bitMapPath = path.join(helper.scopes.localPath, BIT_MAP);
        fs.outputFileSync(bitMapPath, invalidBitMap);
      });
      it('bit status should throw an exception InvalidBitMap', () => {
        const statusCmd = () => helper.command.runCmd('bit status');
        const error = new InvalidBitMap(bitMapPath, 'Unexpected token t');
        helper.general.expectToThrow(statusCmd, error);
      });
      it('should create a new bitMap file', () => {
        helper.command.runCmd('bit init --reset');
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property(SCHEMA_FIELD);
      });
    });
    describe('when bit.json file is invalid', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.bitJson.corrupt();
      });
      it('bit status should throw an exception InvalidBitJson', () => {
        const bitJsonPath = path.join(helper.scopes.localPath, BIT_JSON);
        const statusCmd = () => helper.command.runCmd('bit status');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        const error = new InvalidBitJson(bitJsonPath, 'Unexpected token t');
        helper.general.expectToThrow(statusCmd, error);
      });
      it('should create a new bit.json file', () => {
        helper.command.runCmd('bit init --reset');
        const bitJson = helper.bitJson.read();
        expect(bitJson).to.have.property('packageManager');
      });
    });
  });
  describe('an existing environment with model and with modified bitMap and bitJson', () => {
    let localScope;
    let bitMap;
    let bitJson;
    let localConsumerFiles;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo(); // this modifies bitMap
      helper.command.tagAllComponents(); // this creates objects in .bit dir

      // modify bit.json
      bitJson = helper.bitJson.read();
      bitJson.packageManager = 'yarn';
      helper.bitJson.write(bitJson);

      bitMap = helper.bitMap.read();
      localConsumerFiles = helper.fs.getConsumerFiles('*', true);
      localScope = helper.scopeHelper.cloneLocalScope();
    });
    describe('bit init', () => {
      before(() => {
        helper.scopeHelper.initWorkspace();
      });
      it('should not change BitMap file', () => {
        const currentBitMap = helper.bitMap.read();
        expect(currentBitMap).to.be.deep.equal(bitMap);
        expect(currentBitMap).to.have.property('bar/foo@0.0.1');
      });
      it('should not change bit.json file', () => {
        const currentBitJson = helper.bitJson.read();
        expect(currentBitJson).to.be.deep.equal(bitJson);
        expect(currentBitJson.packageManager).to.be.equal('yarn');
      });
      it('should not change .bit directory', () => {
        const currentFiles = helper.fs.getConsumerFiles('*', true);
        expect(currentFiles).to.be.deep.equal(localConsumerFiles);
      });
    });
    describe('bit init --reset', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.command.runCmd('bit init --reset');
      });
      it('should not change BitMap file', () => {
        const currentBitMap = helper.bitMap.read();
        expect(currentBitMap).to.be.deep.equal(bitMap);
        expect(currentBitMap).to.have.property('bar/foo@0.0.1');
      });
      it('should not change bit.json file', () => {
        const currentBitJson = helper.bitJson.read();
        expect(currentBitJson).to.be.deep.equal(bitJson);
        expect(currentBitJson.packageManager).to.be.equal('yarn');
      });
      it('should not change .bit directory', () => {
        const currentFiles = helper.fs.getConsumerFiles('*', true);
        expect(currentFiles).to.be.deep.equal(localConsumerFiles);
      });
    });
    describe('bit init --reset-hard', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.command.runCmd('bit init --reset-hard');
      });
      it('should recreate the BitMap file', () => {
        const currentBitMap = helper.bitMap.read();
        expect(currentBitMap).to.not.be.deep.equal(bitMap);
        expect(currentBitMap).to.not.have.property('bar/foo@0.0.1');
      });
      it('should recreate the bit.json file', () => {
        const currentBitJson = helper.bitJson.read();
        expect(currentBitJson).to.not.be.deep.equal(bitJson);
        expect(currentBitJson.packageManager).to.not.be.equal('yarn');
      });
      it('should recreate .bit directory', () => {
        const currentFiles = helper.fs.getConsumerFiles('*', true);
        expect(currentFiles).to.not.be.deep.equal(localConsumerFiles);
      });
      it('.bit/objects directory should be empty', () => {
        const objectsDir = path.join(helper.scopes.localPath, '.bit', 'objects');
        expect(objectsDir).to.be.a.directory().and.empty;
      });
      it('should not delete the user files', () => {
        expect(path.join(helper.scopes.localPath, 'bar/foo.js')).to.be.a.file();
      });
      it('bit status should show nothing-to-tag', () => {
        helper.command.expectStatusToBeClean();
      });
    });
  });
  describe('when a project has package.json file', () => {
    describe('without --standalone flag', () => {
      before(() => {
        helper.scopeHelper.cleanLocalScope();
        helper.npm.initNpm();
        helper.scopeHelper.initLocalScope();
      });
      it('should write the bit.json content into the package.json inside "bit" property', () => {
        const packageJson = helper.packageJson.read();
        expect(packageJson).to.have.property('bit');
        expect(packageJson.bit).to.have.property('componentsDefaultDirectory');
        expect(packageJson.bit.componentsDefaultDirectory).to.equal('components/{name}');
      });
      it('should not create bit.json file', () => {
        expect(path.join(helper.scopes.localPath, 'bit.json')).to.not.be.a.path();
      });
      it('should preserve the default npm indentation of 2', () => {
        const packageJson = helper.fs.readFile('package.json');
        expect(detectIndent(packageJson).amount).to.equal(2);
      });
      it('should preserve the new line at the end of json as it was created by npm', () => {
        const packageJson = helper.fs.readFile('package.json');
        expect(packageJson.endsWith('\n')).to.be.true;
      });
    });
    describe('with --standalone flag', () => {
      before(() => {
        helper.scopeHelper.cleanLocalScope();
        helper.npm.initNpm();
        helper.command.runCmd('bit init --standalone');
      });
      it('should not write the bit.json content into the package.json file', () => {
        const packageJson = helper.packageJson.read();
        expect(packageJson).to.not.have.property('bit');
      });
      it('should create bit.json file', () => {
        expect(path.join(helper.scopes.localPath, 'bit.json')).to.be.a.file();
        const bitJson = helper.bitJson.read();
        expect(bitJson).to.have.property('componentsDefaultDirectory');
      });
    });
    describe('when the package.json is corrupted', () => {
      before(() => {
        helper.scopeHelper.cleanLocalScope();
        helper.packageJson.corrupt();
      });
      it('should throw InvalidPackageJson error', () => {
        const initCmd = () => helper.scopeHelper.initLocalScope();
        const error = new InvalidPackageJson(path.join(helper.scopes.localPath, 'package.json'));
        helper.general.expectToThrow(initCmd, error);
      });
    });
    describe('with an indentation of 4', () => {
      before(() => {
        helper.scopeHelper.cleanLocalScope();
        helper.npm.initNpm();
        const packageJson = helper.packageJson.read();
        const packageJsonPath = path.join(helper.scopes.localPath, 'package.json');
        fs.writeJSONSync(packageJsonPath, packageJson, { spaces: 4 });
        helper.scopeHelper.initWorkspace();
      });
      it('should preserve the original indentation and keep it as 4', () => {
        const packageJson = helper.fs.readFile('package.json');
        expect(detectIndent(packageJson).amount).to.equal(4);
      });
    });
  });
  describe('when there is .bitmap, bit.json but not .bit dir', () => {
    describe('when .bit located directly on workspace root', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.bitMap.create();
        helper.fs.deletePath('.bit');
      });
      it('bit ls (or any other command) should not throw an error and should rebuild .bit dir', () => {
        const lsCmd = () => helper.command.listLocalScope();
        expect(lsCmd).to.not.throw();
        expect(path.join(helper.scopes.localPath, '.bit')).to.be.a.directory();
      });
    });
    describe('when bit located on .git', () => {
      before(() => {
        helper.scopeHelper.cleanLocalScope();
        helper.git.initNewGitRepo();
        helper.scopeHelper.initLocalScope();
        helper.bitMap.create();
        helper.fs.deletePath('.git/bit');
      });
      it('bit ls (or any other command) should not throw an error and should rebuild .bit dir', () => {
        const lsCmd = () => helper.command.listLocalScope();
        expect(lsCmd).to.not.throw();
        expect(path.join(helper.scopes.localPath, '.git/bit')).to.be.a.directory();
      });
    });
    describe('when running from an inner directory that has also .bitmap', () => {
      let innerDir;
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.bitMap.create();
        innerDir = path.join(helper.scopes.localPath, 'inner');
        fs.mkdirSync(innerDir);
        helper.scopeHelper.initWorkspace(innerDir);
        fs.removeSync(path.join(innerDir, '.bit'));
        fs.removeSync(path.join(helper.scopes.localPath, '.bit'));
      });
      it('bit ls (or any other command) should not throw an error and should rebuild .bit dir in the inner directory', () => {
        const lsCmd = () => helper.command.runCmd('bit ls ', innerDir);
        expect(lsCmd).to.not.throw();
        expect(path.join(helper.scopes.localPath, 'inner/.bit')).to.be.a.directory();
      });
    });
  });
  describe('init --bare when a directory is a reserved name', () => {
    before(() => {
      helper.scopeHelper.initLocalScope();
      helper.scopeHelper.cleanLocalScope();
      helper.fs.createNewDirectoryInLocalWorkspace(CURRENT_UPSTREAM);
    });
    it('should throw an error', () => {
      const output = helper.general.runWithTryCatch(
        'bit init --bare',
        path.join(helper.scopes.localPath, CURRENT_UPSTREAM)
      );
      expect(output).to.have.string(`the name "${CURRENT_UPSTREAM}" is a reserved word, please use another name`);
    });
  });
});
