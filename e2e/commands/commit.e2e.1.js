// covers also init, create, tag, import and export commands

import sinon from 'sinon';
import path from 'path';
import chai, { expect } from 'chai';
import Helper from '../e2e-helper';

let logSpy;
const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('bit tag command', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  before(() => {
    helper.reInitLocalScope();
    logSpy = sinon.spy(console, 'log');
  });
  describe('tag component with corrupted bit.json', () => {
    let output;
    it('Should not commit component if bit.json is corrupted', () => {
      const fixture = "import foo from ./foo; module.exports = function foo2() { return 'got foo'; };";
      helper.createFile('bar', 'foo2.js', fixture);
      helper.addComponent('bar/foo2.js', { i: 'bar/foo2' });

      helper.corruptBitJson();
      try {
        helper.commitComponent('bar/foo2');
      } catch (err) {
        output = err.toString();
      }
      expect(output).to.include('error: invalid bit.json: ');
      expect(output).to.include(`${path.join(helper.localScopePath, 'bit.json')}`);
    });
  });
  describe('tag component with invalid mainFile in bitmap', () => {
    let output;
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      const bitMap = helper.readBitMap();
      bitMap['bar/foo'].mainFile = '';
      helper.writeBitMap(bitMap);
      try {
        helper.commitComponent('bar/foo');
      } catch (err) {
        output = err.toString();
      }
    });
    it('should not tag the component', () => {
      expect(output).to.have.string('unable to find the mainFile');
    });
  });
  describe('semver flags', () => {
    let output;
    describe('tag specific component', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.createFile('components', 'patch.js');
        helper.createFile('components', 'minor.js');
        helper.createFile('components', 'major.js');
        helper.createFile('components', 'exact.js');
        helper.addComponent('components/*.js', { n: 'components' });
        helper.commitAllComponents();
      });
      it('Should not allow invalid semver', () => {
        helper.createFile('components', 'default.js');
        helper.addComponent('components/default.js', { i: 'components/default' });
        const version = 'invalidVersion';
        const tag = () => helper.tagWithoutMessage('components/default', version);
        expect(tag).to.throw(
          `error: version ${version} is not a valid semantic version. learn more: https://semver.org`
        );
      });
      it('Should set the version to default version in tag new component', () => {
        helper.createFile('components', 'default.js');
        helper.addComponent('components/default.js', { i: 'components/default' });
        output = helper.commitComponent('components/default');
        const listOutput = JSON.parse(helper.listLocalScope('-j'));
        expect(listOutput).to.deep.include({
          id: 'components/default',
          localVersion: '0.0.1',
          currentVersion: '0.0.1'
        });
      });
      it('Should increment the patch version when no version type specified', () => {
        output = helper.commitComponent('components/default', 'message', '-f');
        expect(output).to.have.string('components/default@0.0.2');
      });
      it('Should increment the patch version when --patch flag specified', () => {
        output = helper.commitComponent('components/patch', 'message', '-f --patch');
        expect(output).to.have.string('components/patch@0.0.2');
      });
      it('Should increment the minor version when --minor flag specified', () => {
        output = helper.commitComponent('components/minor', 'message', '-f --minor');
        expect(output).to.have.string('components/minor@0.1.0');
      });
      it('Should increment the major version when --major flag specified', () => {
        output = helper.commitComponent('components/major', 'message', '-f --major');
        expect(output).to.have.string('components/major@1.0.0');
      });
      it('Should set the exact version when specified on new component', () => {
        helper.createFile('components', 'exact-new.js');
        helper.addComponent('components/exact-new.js', { i: 'components/exact-new' });
        output = helper.commitComponent('components/exact-new 5.12.10', 'message', '-f');
        expect(output).to.have.string('components/exact-new@5.12.10');
      });
      it('Should set the exact version when specified on existing component', () => {
        output = helper.commitComponent('components/exact 3.3.3', 'message', '-f');
        expect(output).to.have.string('components/exact@3.3.3');
      });
      it('Should increment patch version of dependent when using other flag on tag dependency', () => {
        helper.createFile('components', 'dependency.js');
        const fixture = "import foo from './dependency'";
        helper.createFile('components', 'dependent.js', fixture);
        helper.addComponent('components/dependency.js components/dependent.js', { n: 'components' });
        helper.commitAllComponents();
        helper.commitComponent('components/dependency', 'message', '-f --major');
        const listOutput = JSON.parse(helper.listLocalScope('-j'));
        expect(listOutput).to.deep.include({
          id: 'components/dependency',
          localVersion: '1.0.0',
          currentVersion: '1.0.0'
        });
        expect(listOutput).to.deep.include({
          id: 'components/dependent',
          localVersion: '0.0.2',
          currentVersion: '0.0.2'
        });
      });
      it('Should throw error when the version already exists', () => {
        helper.commitComponent('components/exact 5.5.5', 'message', '-f');
        const tagWithExisting = () => helper.commitComponent('components/exact 5.5.5', 'message', '-f');
        expect(tagWithExisting).to.throw(
          `Command failed: ${
            helper.bitBin
          } tag components/exact 5.5.5 -m message -f\nerror: version 5.5.5 already exists for components/exact\n`
        );
      });
      it('Should print same output for flaged tag and non flaged tag', () => {
        helper.reInitLocalScope();
        helper.createFile('components', 'major.js');
        helper.addComponent('components/major.js', { i: 'components/major' });
        const majorOutput = helper.commitComponent('components/major', 'message', '--major');
        helper.reInitLocalScope();
        helper.createFile('components', 'major.js');
        helper.addComponent('components/major.js', { i: 'components/major' });
        const nonFlagedCommit = helper.commitComponent('components/major');
        expect(majorOutput).to.contain('1 components tagged | 1 added, 0 changed, 0 auto-tagged');
        expect(nonFlagedCommit).to.contain('1 components tagged | 1 added, 0 changed, 0 auto-tagged');
      });
    });
    // TODO: fix all the tests in the following "describe" so they will not rely on the output of the previous test
    // waiting for 'bit remove' bug fix
    describe('tag all components', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.createFile('components', 'a.js');
        helper.createFile('components', 'b.js');
        helper.addComponent('components/*.js', { n: 'components' });
      });
      it('Should not allow invalid semver', () => {
        const version = 'invalidVersion';
        const tag = () => helper.tagAllWithoutMessage(version);
        expect(tag).to.throw(
          `error: version ${version} is not a valid semantic version. learn more: https://semver.org`
        );
      });
      it('Should set the version to default version in tag new component', () => {
        helper.commitAllComponents();
        const listOutput = JSON.parse(helper.listLocalScope('-j'));
        expect(listOutput).to.deep.include({ id: 'components/a', localVersion: '0.0.1', currentVersion: '0.0.1' });
        expect(listOutput).to.deep.include({ id: 'components/b', localVersion: '0.0.1', currentVersion: '0.0.1' });
      });
      it('Should increment the patch version when no version type specified', () => {
        helper.createFile('components', 'a.js', 'console.log("v0.0.2")');
        helper.createFile('components', 'b.js', 'console.log("v0.0.2")');
        output = helper.commitAllComponents('message');
        expect(output).to.have.string('components/a@0.0.2');
        expect(output).to.have.string('components/b@0.0.2');
      });
      it('Should increment the patch version when --patch flag specified', () => {
        helper.createFile('components', 'a.js', 'console.log("v0.0.3")');
        helper.createFile('components', 'b.js', 'console.log("v0.0.3")');
        output = helper.commitAllComponents('message', '--patch');
        expect(output).to.have.string('components/a@0.0.3');
        expect(output).to.have.string('components/b@0.0.3');
      });
      it('Should increment the default version without the -m flag', () => {
        helper.createFile('components', 'a.js', 'console.log("v0.0.4")');
        helper.createFile('components', 'b.js', 'console.log("v0.0.4")');
        output = helper.tagAllWithoutMessage();
        expect(output).to.have.string('components/a@0.0.4');
        expect(output).to.have.string('components/b@0.0.4');
      });
      it('Should show message "nothing to tag" if trying to tag with no changes', () => {
        helper.tagAllWithoutMessage();
        const tagWithoutChanges = helper.tagAllWithoutMessage();
        expect(tagWithoutChanges).to.have.string('nothing to tag');
      });
      it('Should increment the minor version when --minor flag specified', () => {
        helper.createFile('components', 'a.js', 'console.log("v0.1.0")');
        helper.createFile('components', 'b.js', 'console.log("v0.1.0")');
        output = helper.commitAllComponents('message', '-f --minor');
        expect(output).to.have.string('components/a@0.1.0');
        expect(output).to.have.string('components/b@0.1.0');
      });
      it('Should increment the major version when --major flag specified', () => {
        helper.createFile('components', 'a.js', 'console.log("v1.0.0")');
        helper.createFile('components', 'b.js', 'console.log("v1.0.0")');
        output = helper.commitAllComponents('message', '--major');
        expect(output).to.have.string('components/a@1.0.0');
        expect(output).to.have.string('components/b@1.0.0');
      });
      it('Should set the exact version when specified on new component', () => {
        helper.createFile('components', 'c.js');
        helper.createFile('components', 'd.js');
        helper.addComponent('components/c.js', { i: 'components/c' });
        helper.addComponent('components/d.js', { i: 'components/d' });
        output = helper.commitAllComponents('message', '-f', '5.12.10');
        expect(output).to.have.string('components/c@5.12.10');
        expect(output).to.have.string('components/d@5.12.10');
      });
      it('Should set the exact version when specified on existing component', () => {
        helper.createFile('components', 'a.js', 'console.log("v3.3.3")');
        helper.createFile('components', 'b.js', 'console.log("v3.3.3")');
        output = helper.commitAllComponents('message', '-f', '3.3.3');
        expect(output).to.have.string('components/a@3.3.3');
        expect(output).to.have.string('components/b@3.3.3');
      });
      it('Should throw error when the version already exists in one of the components', () => {
        helper.createFile('components', 'a.js', 'console.log("v4.3.4")');
        helper.createFile('components', 'b.js', 'console.log("v4.3.4")');
        helper.commitComponent('components/a 4.3.4', 'message');
        helper.createFile('components', 'a.js', 'console.log("v4.3.4 ssss")');
        const tagWithExisting = () => helper.commitAllComponents('message', '', '4.3.4');
        expect(tagWithExisting).to.throw('error: version 4.3.4 already exists for components/a');
      });
    });
  });
  describe('tag one component with failing tests', () => {
    let scopeBeforeTagging;
    before(() => {
      helper.importTester('bit.envs/testers/mocha@0.0.12');
      const failingTest = `const expect = require('chai').expect;
      const foo = require('./foo.js');
      describe('failing test', () => {
        it('should fail', () => {
          expect(true).to.equal(false);
        })
      });`;
      helper.createComponentBarFoo();
      helper.createFile('bar', 'foo.spec.js', failingTest);
      helper.installNpmPackage('chai', '4.1.2');
      helper.addComponent('bar/foo.js', { t: 'bar/foo.spec.js', i: 'bar/foo' });
      scopeBeforeTagging = helper.cloneLocalScope();
    });
    it('should throw error if the bit id does not exists', () => {
      let output;
      try {
        helper.tagWithoutMessage('non/existing');
      } catch (err) {
        output = err.message;
      }
      expect(output).to.have.string(
        `Command failed: ${
          helper.bitBin
        } tag non/existing  \nerror: component "non/existing" was not found on your local workspace.\nplease specify a valid component ID or track the component using 'bit add' (see 'bit add --help' for more information)\n`
      );
    });
    it.skip('should print warning if the a driver is not installed', () => {
      const fixture = "import foo from ./foo; module.exports = function foo2() { return 'got foo'; };";
      helper.createFile('bar', 'foo2.js', fixture);
      helper.addComponent('bar/foo2.js', { i: 'bar/foo2' });
      // var myargs = logSpy.getCalls()[4].args
      // console.log("args", myargs);
      expect(
        logSpy.calledWith(
          'Warning: Bit is not be able calculate the dependencies tree. Please install bit-javascript driver and run tag again.\n'
        )
      ).to.be.true;
    });
    it.skip('should persist the model in the scope', () => {});
    it.skip('should run the onCommit hook', () => {});
    it.skip('should throw error if the build failed', () => {});
    describe('tagging without --verbose flag', () => {
      let output;
      before(() => {
        try {
          helper.tagWithoutMessage('bar/foo');
        } catch (err) {
          output = err.message;
        }
      });
      it('should throw a general error saying the tests failed', () => {
        expect(output).to.have.string(
          'component tests failed. please make sure all tests pass before tagging a new version or use the "--force" flag to force-tag components.\nto view test failures, please use the "--verbose" flag or use the "bit test" command\n'
        );
      });
      it('should not display the tests results', () => {
        expect(output).to.not.have.string('failing test should fail');
        expect(output).to.not.have.string('expected true to equal false');
      });
    });
    describe('tagging with --verbose flag', () => {
      let output;
      before(() => {
        try {
          helper.tagWithoutMessage('bar/foo --verbose');
        } catch (err) {
          output = err.toString() + err.stdout.toString();
        }
      });
      it('should display the failing tests results', () => {
        expect(output).to.have.string('failing test should fail');
        expect(output).to.have.string('expected true to equal false');
      });
      it('should display the failed component', () => {
        expect(output).to.have.string('bar/foo');
      });
      it('should display the failed test file', () => {
        expect(output).to.have.string('file: bar/foo.spec.js');
      });
      it('should also display a general error saying the tests failed', () => {
        expect(output).to.have.string(
          'component tests failed. please make sure all tests pass before tagging a new version or use the "--force" flag to force-tag components.\nto view test failures, please use the "--verbose" flag or use the "bit test" command\n'
        );
      });
    });
    describe('tagging with --force flag', () => {
      let output;
      before(() => {
        helper.getClonedLocalScope(scopeBeforeTagging);
        output = helper.tagWithoutMessage('bar/foo --force');
      });
      it('should tag successfully although the tests failed', () => {
        expect(output).to.have.string('1 components tagged');
      });
      it('should not display any data about the tests', () => {
        expect(output).to.not.have.string("component's specs does not pass, fix them and tag");
        expect(output).to.not.have.string('failing test should fail');
      });
    });
    describe('tagging with --skip-tests flag', () => {
      let output;
      before(() => {
        helper.getClonedLocalScope(scopeBeforeTagging);
        output = helper.tagWithoutMessage('bar/foo --skip-tests');
      });
      it('should tag successfully although the tests failed', () => {
        expect(output).to.have.string('1 components tagged');
      });
      it('should not display any data about the tests', () => {
        expect(output).to.not.have.string("component's specs does not pass, fix them and tag");
        expect(output).to.not.have.string('failing test should fail');
      });
    });
    // @todo: fix this test to not rely on all the "it" of 'tag all components'
    describe('tagging all with --skip-tests flag', () => {
      let output;
      before(() => {
        helper.getClonedLocalScope(scopeBeforeTagging);
        output = helper.tagAllWithoutMessage('--skip-tests');
      });
      it('should tag successfully although the tests failed', () => {
        expect(output).to.have.string('5 components tagged');
      });
      it('should not display any data about the tests', () => {
        expect(output).to.not.have.string("component's specs does not pass, fix them and tag");
        expect(output).to.not.have.string('failing test should fail');
      });
    });
    describe.skip('tag imported component', () => {
      it('should index the component', () => {});

      it('should write the full id to bit map (include scope and version)', () => {});

      it('should create fork of the component', () => {
        // Should change the original version origin to nested if it's required by another imported deps
        // Should update all the deps in my own files to use the new version
        // Should move the old version in the fs to be nested
        // Should update the bit.map to point from the new version to the existing file
        // Should bind from other deps to the new fs location
      });
    });
  });

  describe('tag added component', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('', 'file.js');
      helper.addComponent('file.js', { i: 'comp/comp' });
      output = helper.commitComponent('comp/comp');
    });

    it('should successfully tag if there is no special error', () => {
      // Validate output
      expect(output).to.have.string('1 components tagged');
      // Validate model
    });

    it.skip('Should throw error if there is tracked files dependencies which not tagged yet', () => {});

    describe('package dependencies calculation', () => {
      let packageDependencies;
      let depObject;
      let componentRootDir;
      before(() => {
        helper.reInitLocalScope();

        const fileFixture = 'import get from "lodash.isstring"';
        helper.createFile('src', 'file.js', fileFixture);
        helper.addComponent('src/file.js', { i: 'comp/comp' });
        helper.addNpmPackage('lodash.isstring', '2.0.0');

        // Commit, export and import the component to make sure we have root folder defined in the bit.map
        helper.reInitRemoteScope();
        helper.addRemoteScope();
        helper.commitComponent('comp/comp');
        helper.exportComponent('comp/comp');
        helper.reInitLocalScope('comp/comp');
        helper.addRemoteScope();
        helper.importComponent('comp/comp --skip-npm-install');
        helper.addNpmPackage('lodash.isstring', '3.0.0');
        const bitMap = helper.readBitMap();
        componentRootDir = path.normalize(bitMap[`${helper.remoteScope}/comp/comp@0.0.1`].rootDir);
      });
      it('should take the package version from package.json in the component dir if exists', () => {
        const componentPackageJsonFixture = JSON.stringify({ dependencies: { 'lodash.isstring': '^2.0.1' } });
        helper.createFile(componentRootDir, 'package.json', componentPackageJsonFixture);
        helper.commitComponent('comp/comp');
        output = helper.showComponentWithOptions('comp/comp', { j: '' });
        packageDependencies = JSON.parse(output).packageDependencies;
        depObject = { 'lodash.isstring': '^2.0.1' };
        expect(packageDependencies).to.include(depObject);
      });
      it('should take the package version from package.json in the consumer root dir if the package.json not exists in component dir', () => {
        helper.deleteFile(path.join(componentRootDir, 'package.json'));
        helper.commitComponent('comp/comp');
        output = helper.showComponentWithOptions('comp/comp', { j: '' });
        packageDependencies = JSON.parse(output).packageDependencies;
        depObject = { 'lodash.isstring': '3.0.0' };
        expect(packageDependencies).to.include(depObject);
      });
      it('should take the package version from package.json in the consumer root dir if the package.json in component root dir does not contain the package definition', () => {
        const componentPackageJsonFixture = JSON.stringify({ dependencies: { 'fake.package': '^1.0.1' } });
        helper.createFile(componentRootDir, 'package.json', componentPackageJsonFixture);
        helper.commitComponent('comp/comp');
        output = helper.showComponentWithOptions('comp/comp', { j: '' });
        packageDependencies = JSON.parse(output).packageDependencies;
        depObject = { 'lodash.isstring': '3.0.0' };
        expect(packageDependencies).to.include(depObject);
      });
      it('should take the package version from the package package.json if the package.json not exists in component / root dir', () => {
        helper.deleteFile(path.join(componentRootDir, 'package.json'));
        helper.deleteFile('package.json');
        helper.commitComponent('comp/comp');
        output = helper.showComponentWithOptions('comp/comp', { j: '' });
        packageDependencies = JSON.parse(output).packageDependencies;
        depObject = { 'lodash.isstring': '3.0.0' };
        expect(packageDependencies).to.include(depObject);
      });
      it('should take the package version from the package package.json if the package.json in component / root dir does not contain the package definition', () => {
        helper.deleteFile(path.join(componentRootDir, 'package.json'));
        const rootPackageJsonFixture = JSON.stringify({ dependencies: { 'fake.package': '^1.0.1' } });
        helper.createFile('', 'package.json', rootPackageJsonFixture);
        helper.commitComponent('comp/comp');
        output = helper.showComponentWithOptions('comp/comp', { j: '' });
        packageDependencies = JSON.parse(output).packageDependencies;
        depObject = { 'lodash.isstring': '3.0.0' };
        expect(packageDependencies).to.include(depObject);
      });
    });
  });

  describe('tag back', () => {
    // This is specifically export more than one component since it's different case for the
    // resolveLatestVersion.js - getLatestVersionNumber function
    describe('tag component after exporting 2 components', () => {
      let output;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createFile('', 'file.js');
        helper.createFile('', 'file2.js');
        helper.addComponent('file.js', { i: 'comp/comp' });
        helper.addComponent('file2.js', { i: 'comp/comp2' });
        helper.commitAllComponents();
        helper.exportAllComponents();
        helper.createFile('', 'file.js', 'console.log()');
        output = helper.commitAllComponents();
      });
      it('should tag the component', () => {
        expect(output).to.have.string('1 components tagged');
      });
    });
  });

  describe('tag imported component with new dependency to another imported component', () => {
    describe('require the main file of the imported component', () => {
      let output;
      let showOutput;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createFile('', 'file.js');
        helper.createFile('', 'file2.js');
        helper.addComponent('file.js', { i: 'comp/comp' });
        helper.addComponent('file2.js', { i: 'comp/comp2' });
        helper.commitAllComponents();
        helper.exportAllComponents();
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('comp/comp');
        helper.importComponent('comp/comp2');
        const fileFixture = `var a = require('@bit/${helper.remoteScope}.comp.comp2/file2')`;
        helper.createFile('components/comp/comp', 'file.js', fileFixture);
        output = helper.commitComponent('comp/comp');
        showOutput = JSON.parse(helper.showComponentWithOptions('comp/comp', { j: '' }));
      });
      it('should tag the component', () => {
        expect(output).to.have.string('1 components tagged');
      });
      it('should write the dependency to the component model', () => {
        const deps = showOutput.dependencies;
        expect(deps.length).to.equal(1);
      });
      it('should increment the package.json version of the tagged component', () => {
        const packageJson = helper.readPackageJson(path.join(helper.localScopePath, 'components/comp/comp'));
        expect(packageJson.version).to.equal('0.0.2');
      });
    });

    describe('require the index file of the imported component', () => {
      let output;
      let showOutput;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createFile('', 'file.js');
        helper.createFile('', 'file2.js');
        helper.addComponent('file.js', { i: 'comp/comp' });
        helper.addComponent('file2.js', { i: 'comp/comp2' });
        helper.commitAllComponents();
        helper.exportAllComponents();
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('comp/comp');
        helper.importComponent('comp/comp2');
        const fileFixture = `var a = require('${helper.getRequireBitPath('comp', 'comp2')}')`;
        helper.createFile('components/comp/comp', 'file.js', fileFixture);
        output = helper.commitComponent('comp/comp');
        showOutput = JSON.parse(helper.showComponentWithOptions('comp/comp', { j: '' }));
      });
      it('should tag the component', () => {
        expect(output).to.have.string('1 components tagged');
      });
      it('should write the dependency to the component model ', () => {
        const deps = showOutput.dependencies;
        expect(deps.length).to.equal(1);
      });
    });
  });

  describe('after requiring an imported component with the relative syntax', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createFile('utils', 'is-type.js', isTypeFixture);
      helper.addComponentUtilsIsType();

      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-type');

      const isStringFixture =
        "const isType = require('../components/utils/is-type'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createFile('utils', 'is-string.js', isStringFixture);
      helper.addComponentUtilsIsString();
      try {
        helper.commitAllComponents();
      } catch (err) {
        output = err.toString();
      }
    });
    it('should not tag and throw an error regarding the relative syntax', () => {
      expect(output).to.have.string('error: issues found with the following component dependencies');
      expect(output).to.have.string(
        'components with relative import statements (please use absolute paths for imported components)'
      );
      expect(output).to.have.string(`${helper.remoteScope}/utils/is-type@0.0.1`);
    });
  });

  // there is another describe('tag all components')
  describe('tag all components', () => {
    it.skip('Should print there is nothing to tag after import only', () => {
      // Import component then try to tag
    });

    it.skip('Should build and test all components before tag', () => {});

    it.skip('Should tag nothing if only some of the tags worked', () => {});

    describe('missing dependencies errors', () => {
      let output;
      before(() => {
        helper.reInitLocalScope();
        const fileAfixture = "import a2 from './a2'; import a3 from './a3'";
        helper.createFile('src', 'a.js', fileAfixture);
        const fileA2fixture =
          "import a3 from './a3';import pdackage from 'package';import missingfs from './missing-fs';import untracked from './untracked.js';";
        helper.createFile('src', 'a2.js', fileA2fixture);
        const fileBfixture =
          "import b3 from './b3';import pdackage from 'package2';import missingfs from './missing-fs2';import untracked from './untracked2.js';";
        helper.createFile('src', 'b.js', fileBfixture);

        helper.createFile('src', 'untracked.js');
        helper.createFile('src', 'untracked2.js');

        helper.addComponent('src/a.js src/a2.js', { m: 'src/a.js', i: 'comp/a' });
        helper.addComponent('src/b.js', { i: 'src/b' });

        const commitAll = () => helper.commitAllComponents();
        try {
          commitAll();
        } catch (err) {
          output = err.toString();
        }
      });

      // TODO: check why it's working on local and not on ci. i guess it's because we don't know to load the bit-js on CI
      it('Should print that there is missing dependencies', () => {
        expect(output).to.have.string('error: issues found with the following component dependencies');
      });

      it('Should print the components name with missing dependencies', () => {
        expect(output).to.have.string('comp/a');
        expect(output).to.have.string('src/b');
      });

      it('Should print that there is missing dependencies on file system (nested)', () => {
        expect(output).to.have.string('./a3');
        expect(output).to.have.string('./missing-fs');
        expect(output).to.have.string('./b3');
        expect(output).to.have.string('./missing-fs2');
      });

      // TODO: check why it's working on local and not on ci. i guess it's because we don't know to load the bit-js on CI
      it('Should print that there is missing package dependencies on file system (nested)', () => {
        expect(output).to.have.string('package');
        expect(output).to.have.string('package2');
      });

      it('Should print that there is untracked dependencies on file system (nested)', () => {
        expect(output).to.have.string('src/untracked.js');
        expect(output).to.have.string('src/untracked2.js');
      });
    });
    describe('commit component with missing dependencies with --ignore-unresolved-dependencies', () => {
      let output;
      before(() => {
        helper.reInitLocalScope();
        const fileAfixture = "import a2 from './a2'; import a3 from './a3'";
        helper.createFile('src', 'a.js', fileAfixture);
        const fileA2fixture =
          "import a3 from './a3';import pdackage from 'package';import missingfs from './missing-fs';import untracked from './untracked.js';";
        helper.createFile('src', 'a2.js', fileA2fixture);
        const fileBfixture =
          "import b3 from './b3';import pdackage from 'package2';import missingfs from './missing-fs2';import untracked from './untracked2.js';";
        helper.createFile('src', 'b.js', fileBfixture);

        helper.createFile('src', 'untracked.js');
        helper.createFile('src', 'untracked2.js');

        helper.addComponent('src/a.js src/a2.js', { m: 'src/a.js', i: 'comp/a' });
        helper.addComponent('src/b.js', { i: 'src/b' });

        const commitOne = () => helper.commitComponent('comp/a', 'commit-msg', '--ignore-unresolved-dependencies');
        try {
          output = commitOne();
        } catch (err) {
          output = err.toString();
        }
      });

      it('Should print that the component is committed', () => {
        expect(output).to.have.string('1 components tagged');
      });
    });
    describe('commit all components with missing dependencies with --ignore-unresolved-dependencies', () => {
      let output;
      before(() => {
        helper.reInitLocalScope();
        const fileAfixture = "import a2 from './a2'; import a3 from './a3'";
        helper.createFile('src', 'a.js', fileAfixture);
        const fileA2fixture =
          "import a3 from './a3';import pdackage from 'package';import missingfs from './missing-fs';import untracked from './untracked.js';";
        helper.createFile('src', 'a2.js', fileA2fixture);
        const fileBfixture =
          "import b3 from './b3';import pdackage from 'package2';import missingfs from './missing-fs2';import untracked from './untracked2.js';";
        helper.createFile('src', 'b.js', fileBfixture);

        helper.createFile('src', 'untracked.js');
        helper.createFile('src', 'untracked2.js');

        helper.addComponent('src/a.js src/a2.js', { m: 'src/a.js', i: 'comp/a' });
        helper.addComponent('src/b.js', { i: 'src/b' });

        const commitAll = () => helper.commitAllComponents('commit-msg', '--ignore-unresolved-dependencies');
        try {
          output = commitAll();
        } catch (err) {
          output = err.toString();
        }
      });

      it('Should print that the components are commited', () => {
        expect(output).to.have.string('2 components tagged');
      });
    });
    // We throw this error because we don't know the packege version in this case
    it.skip('should throw error if there is missing package dependency', () => {});

    it.skip('should index all components', () => {});

    it.skip('should tag the components in the correct order', () => {});

    it.skip('should add the correct dependencies to each component', () => {
      // Make sure the use case contain dependenceis from all types -
      // Packages, files and bits
    });

    it('should add dependencies for files which are not the main files', () => {
      helper.reInitLocalScope();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createFile('utils', 'is-type.js', isTypeFixture);
      helper.addComponentUtilsIsType();
      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createFile('utils', 'is-string.js', isStringFixture);
      helper.addComponentUtilsIsString();

      const mainFileFixture =
        "const isString = require('./utils/is-string.js'); const second = require('./second.js'); module.exports = function foo() { return isString() + ' and got foo'; };";
      const secondFileFixture =
        "const isType = require('./utils/is-type.js'); module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.createFile('', 'main.js', mainFileFixture);
      helper.createFile('', 'second.js', secondFileFixture);
      helper.addComponent('main.js second.js', { m: 'main.js', i: 'comp/comp' });

      helper.commitAllComponents();

      const output = helper.showComponentWithOptions('comp/comp', { j: '' });
      const dependencies = JSON.parse(output).dependencies;

      const depPathsIsString = {
        sourceRelativePath: 'utils/is-string.js',
        destinationRelativePath: 'utils/is-string.js'
      };
      const depPathsIsType = { sourceRelativePath: 'utils/is-type.js', destinationRelativePath: 'utils/is-type.js' };

      expect(dependencies.find(dep => dep.id === 'utils/is-string@0.0.1').relativePaths[0]).to.deep.equal(
        depPathsIsString
      );
      expect(dependencies.find(dep => dep.id === 'utils/is-type@0.0.1').relativePaths[0]).to.deep.equal(depPathsIsType);
    });

    it('should add dependencies for non-main files regardless whether they are required from the main file', () => {
      helper.reInitLocalScope();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createFile('utils', 'is-type.js', isTypeFixture);
      helper.addComponentUtilsIsType();
      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createFile('utils', 'is-string.js', isStringFixture);
      helper.addComponentUtilsIsString();

      const mainFileFixture =
        "const isString = require('./utils/is-string.js'); module.exports = function foo() { return isString() + ' and got foo'; };";
      const secondFileFixture =
        "const isType = require('./utils/is-type.js'); module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.createFile('', 'main.js', mainFileFixture);
      helper.createFile('', 'second.js', secondFileFixture);
      helper.addComponent('main.js second.js', { m: 'main.js', i: 'comp/comp' });

      helper.commitAllComponents();

      const output = helper.showComponentWithOptions('comp/comp', { j: '' });
      const dependencies = JSON.parse(output).dependencies;
      const depPathsIsString = {
        sourceRelativePath: 'utils/is-string.js',
        destinationRelativePath: 'utils/is-string.js'
      };
      const depPathsIsType = { sourceRelativePath: 'utils/is-type.js', destinationRelativePath: 'utils/is-type.js' };

      expect(dependencies.find(dep => dep.id === 'utils/is-string@0.0.1').relativePaths[0]).to.deep.equal(
        depPathsIsString
      );
      expect(dependencies.find(dep => dep.id === 'utils/is-type@0.0.1').relativePaths[0]).to.deep.equal(depPathsIsType);
    });

    it.skip('should persist all models in the scope', () => {});

    it.skip('should run the onCommit hook', () => {});
  });
  describe('with removed file/files', () => {
    beforeEach(() => {
      helper.initNewLocalScope();
      helper.createComponentBarFoo();
      helper.createFile('bar', 'index.js');
      helper.addComponent('bar/', { i: 'bar/foo' });
    });
    it('Should commit component only with the left files', () => {
      const beforeRemoveBitMap = helper.readBitMap();
      const beforeRemoveBitMapFiles = beforeRemoveBitMap['bar/foo'].files;
      expect(beforeRemoveBitMapFiles).to.be.ofSize(2);
      helper.deleteFile('bar/foo.js');
      helper.commitAllComponents();
      const bitMap = helper.readBitMap();
      const files = bitMap['bar/foo@0.0.1'].files;
      expect(files).to.be.ofSize(1);
      expect(files[0].name).to.equal('index.js');
    });
    it('Should not let you tag with a non-existing dependency', () => {
      let errMsg;
      helper.createFile('bar', 'foo.js', '');
      helper.createFile('bar', 'index.js', 'var foo = require("./foo.js")');
      helper.addComponent('bar/', { i: 'bar/foo' });
      helper.deleteFile('bar/foo.js');
      try {
        helper.runCmd('bit tag -a');
      } catch (err) {
        errMsg = err.message;
      }
      const output = helper.listLocalScope();
      expect(errMsg).to.have.string('error: issues found with the following component dependencies');
      expect(output).to.not.have.string('bar/foo');
    });
    it('Should throw error that all files were removed', () => {
      const beforeRemoveBitMap = helper.readBitMap();
      const beforeRemoveBitMapfiles = beforeRemoveBitMap['bar/foo'].files;
      expect(beforeRemoveBitMapfiles).to.be.ofSize(2);
      helper.deleteFile('bar/index.js');
      helper.deleteFile('bar/foo.js');

      const commitCmd = () => helper.commitAllComponents();
      expect(commitCmd).to.throw(
        `Command failed: ${
          helper.bitBin
        } tag  -a  -m commit-message \ncomponent bar/foo is invalid as part or all of the component files were deleted. please use 'bit remove' to resolve the issue\n`
      );
    });
  });
  describe('with --scope flag', () => {
    let localScope;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createFile('utils', 'is-type.js', isTypeFixture);
      helper.addComponentUtilsIsType();
      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createFile('utils', 'is-string.js', isStringFixture);
      helper.addComponentUtilsIsString();

      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-string');

      const fooBarFixture = `const isString = require('${helper.getRequireBitPath(
        'utils',
        'is-string'
      )}'); module.exports = function foo() { return isString() + ' and got foo'; };`;
      helper.createComponentBarFoo(fooBarFixture);
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      localScope = helper.cloneLocalScope();
    });
    describe('without --all flag', () => {
      describe('when current components have lower versions', () => {
        let output;
        before(() => {
          output = helper.tagScope('0.0.5', 'msg');
        });
        it('should tag authored components with the specified version', () => {
          expect(output).to.have.string('1 components tagged');
          expect(output).to.have.string('bar/foo');
        });
        it('should not tag imported components', () => {
          expect(output).not.to.have.string('utils/is-string');
        });
        it('should not tag nested components', () => {
          expect(output).not.to.have.string('utils/is-type');
        });
      });
      describe('when one of the components has the same version', () => {
        let output;
        before(() => {
          helper.commitComponent('bar/foo 0.0.8', 'msg', '--force');
          try {
            helper.commitAllComponents('msg', '--scope 0.0.8');
          } catch (err) {
            output = err.toString();
          }
        });
        it('should throw an error', () => {
          expect(output).to.have.string(
            `Error: Command failed: ${
              helper.bitBin
            } tag --scope 0.0.8 -a  -m msg \nerror: version 0.0.8 already exists for bar/foo\n`
          );
        });
      });
      describe('when one of the components has a greater version', () => {
        let output;
        before(() => {
          helper.commitComponent('bar/foo 0.1.5', 'msg', '--force');
          output = helper.tagScope('0.1.4', 'msg');
        });
        it('should display a warning', () => {
          expect(output).to.have.string('warning: bar/foo@0.1.5 has a version greater than 0.1.4');
        });
        it('should continue tagging the authored components', () => {
          expect(output).to.have.string('1 components tagged');
          expect(output).to.have.string('bar/foo@0.1.4');
        });
      });
    });
    describe('with --all flag', () => {
      describe('when current components have lower versions', () => {
        let output;
        before(() => {
          helper.getClonedLocalScope(localScope);
          output = helper.commitAllComponents('msg', '--scope 0.2.0 --all');
        });
        it('should tag all components with the specified version including the imported components', () => {
          // this also verifies that the auto-tag feature, doesn't automatically update is-string to its next version
          // current version of is-string is 0.0.1, so auto-tag would tag it to 0.0.2
          expect(output).to.have.string('2 components tagged');
          expect(output).to.have.string('bar/foo@0.2.0');
          expect(output).to.have.string('utils/is-string@0.2.0');
        });
        it('should not tag nested components', () => {
          expect(output).not.to.have.string('utils/is-type');
        });
      });
    });
  });
  describe('with Windows end-of-line characters', () => {
    before(() => {
      helper.reInitLocalScope();
      const impl = 'hello\r\n world\r\n';
      helper.createComponentBarFoo(impl);
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
    });
    it('should write the file to the model with Linux EOL characters', () => {
      const barFoo = helper.catComponent('bar/foo@latest');
      const fileHash = barFoo.files[0].file;
      const fileContent = helper.runCmd(`bit cat-object ${fileHash} -s`);
      // notice how the \r is stripped
      expect(fileContent).to.have.string('"hello\\n world\\n"');
    });
  });
});
