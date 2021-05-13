import chai, { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';
import { IssuesClasses, MISSING_DEPS_SPACE, MISSING_NESTED_DEPS_SPACE } from '@teambit/component-issues';
import { statusFailureMsg, statusInvalidComponentsMsg } from '../../src/cli/commands/public-cmds/status-cmd';
import { MISSING_PACKAGES_FROM_OVERRIDES_LABEL } from '../../src/cli/templates/component-issues-template';
import { IMPORT_PENDING_MSG } from '../../src/constants';
import ComponentNotFoundInPath from '../../src/consumer/component/exceptions/component-not-found-in-path';
import MissingFilesFromComponent from '../../src/consumer/component/exceptions/missing-files-from-component';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('bit status command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('before running "bit init" with .bit.map.json', () => {
    it('Should init consumer add then run  status ', () => {
      helper.bitMap.create();
      helper.fs.createFile('bar', 'foo.js');
      const output = helper.command.runCmd('bit status');
      expect(output).to.include('bar/foo');
    });
  });
  describe('when no components created', () => {
    before(() => {
      helper.scopeHelper.clean();
      helper.scopeHelper.initWorkspace();
    });
    it('should indicate that there are no components', () => {
      helper.command.expectStatusToBeClean();
    });
  });

  describe('when a component is created in components directory but not added', () => {
    before(() => {
      helper.scopeHelper.clean();
      helper.scopeHelper.initWorkspace();
      helper.fs.createFile(path.join('components', 'bar'), 'foo.js');
    });
    it('should indicate that there are no components and should not throw an error', () => {
      helper.command.expectStatusToBeClean();
    });
  });
  describe('when a component is created and added but not tagged', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      output = helper.command.runCmd('bit status');
    });
    it('should display that component as a new component', () => {
      expect(output.includes('new components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
    });
    it('should not display that component as modified', () => {
      expect(output.includes('modified components')).to.be.false;
    });
    it('should not display that component as staged', () => {
      expect(output.includes('staged components')).to.be.false;
    });
  });
  describe('when a component is created and added without its dependencies', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fs.createFile(
        '',
        'comp1.js',
        `require("./comp2");require("./comp3");require("./comp4");require("./comp5");require("./comp6");`
      );
      helper.fs.createFile('', 'comp2.js', `require("./comp4");require("./comp5");`);
      helper.fs.createFile('', 'comp3.js', '');
      helper.fs.createFile('', 'comp4.js', '');
      helper.fs.createFile('', 'comp5.js', 'require("./comp6");');
      helper.fs.createFile('', 'comp6.js', '');
      helper.command.addComponent('comp1.js', { i: 'comp1' });
      helper.command.addComponent('comp5.js', { i: 'comp5' });
    });
    it('Should show missing dependencies', () => {
      output = helper.command.runCmd('bit status');
      const countComp5Deps = (output.match(/comp5.js -> comp6.js/g) || []).length;
      expect(output).to.have.string('untracked file dependencies');
      expect(output).to.have.string('comp1 ...  issues found');
      expect(output).to.have.string('comp1.js -> comp2.js, comp3.js, comp4.js, comp6.js');
      expect(output).to.have.string('comp2.js -> comp4.js');
      expect(output).to.have.string('comp5.js -> comp6.js');
      // Make sure comp5->comp6 appear only under comp5
      expect(countComp5Deps).to.equal(1);
      expect(output).to.have.string('comp5 ...  issues found');
      // Validate indentations is correct, nested deps should be indent 2 more
      expect(output).to.have.string(`${MISSING_DEPS_SPACE}comp1.js`);
      expect(output).to.have.string(`${MISSING_NESTED_DEPS_SPACE}comp2.js`);
      expect(output).to.have.string(`${MISSING_DEPS_SPACE}comp5.js`);
    });
  });
  describe('when a component is created and added without its package dependencies', () => {
    let output;
    describe('when a component has missing packages from both overrides and code', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fs.createFile('bar', 'foo.js', 'var React = require("react")');
        helper.fixtures.addComponentBarFoo();
        const overrides = {
          'bar/foo': {
            dependencies: {
              chai: '+',
            },
          },
        };
        helper.bitJson.addOverrides(overrides);
      });
      it('Should show missing package dependencies', () => {
        output = helper.command.runCmd('bit status').replace(/\n/g, '');
        helper.command.expectStatusToHaveIssue(IssuesClasses.MissingPackagesDependenciesOnFs.name);
        expect(output).to.have.string('bar/foo.js -> react');
        expect(output).to.have.string(`${MISSING_PACKAGES_FROM_OVERRIDES_LABEL} -> chai`);
      });
    });
    describe('when a component has missing packages only from overrides', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fs.createFile('bar', 'foo.js', '');
        helper.fixtures.addComponentBarFoo();
        const overrides = {
          'bar/foo': {
            dependencies: {
              chai: '+',
            },
          },
        };
        helper.bitJson.addOverrides(overrides);
      });
      it('Should show missing package dependencies', () => {
        output = helper.command.runCmd('bit status').replace(/\n/g, '');
        helper.command.expectStatusToHaveIssue(IssuesClasses.MissingPackagesDependenciesOnFs.name);
        expect(output).to.have.string(`${MISSING_PACKAGES_FROM_OVERRIDES_LABEL} -> chai`);
      });
    });
  });
  describe('when a component is created, added and tagged', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      output = helper.command.runCmd('bit status');
    });
    it('should display that component as a staged component', () => {
      expect(output.includes('no staged components')).to.be.false;

      expect(output.includes('staged components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
    });
    it('should not display that component as modified', () => {
      expect(output.includes('modified components')).to.be.false;
    });
    it('should not display that component as new', () => {
      expect(output.includes('new components')).to.be.false;
    });
  });
  describe('when a component is modified after tag', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      // modify the component
      helper.fixtures.createComponentBarFoo("module.exports = function foo() { return 'got foo v2'; };");
      output = helper.command.runCmd('bit status');
    });
    it('should display that component as a modified component', () => {
      expect(output.includes('no modified components')).to.be.false;

      expect(output.includes('modified components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
    });
    it('should display that component as a staged component (?)', () => {
      // todo: currently, it shows the component also as staged, because practically, it is export pending as well.
      // are we good with it?
      expect(output.includes('no staged components')).to.be.false;

      expect(output.includes('staged components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
    });
    it('should not display that component as new', () => {
      expect(output.includes('new components')).to.be.false;
    });
  });
  describe('when a component is created, added, tagged and exported', () => {
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportComponent('bar/foo');
      output = helper.command.runCmd('bit status');
    });
    it('should not display that component as new', () => {
      expect(output.includes('new components')).to.be.false;
    });
    it('should not display that component as modified', () => {
      expect(output.includes('modified components')).to.be.false;
    });
    it('should not display that component as staged', () => {
      expect(output.includes('staged components')).to.be.false;
    });
  });
  describe('when a component is modified after export', () => {
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportComponent('bar/foo');
      // modify the component
      helper.fixtures.createComponentBarFoo("module.exports = function foo() { return 'got foo v2'; };");
      output = helper.command.runCmd('bit status');
    });
    it('should display that component as a modified component', () => {
      expect(output.includes('no modified components')).to.be.false;

      expect(output.includes('modified components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
    });
    it('should not display that component as staged', () => {
      expect(output.includes('staged components')).to.be.false;
    });
    it('should not display that component as new', () => {
      expect(output.includes('new components')).to.be.false;
    });
  });
  describe('when a component is exported, modified and then tagged', () => {
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportComponent('bar/foo');
      // modify the component
      helper.fixtures.createComponentBarFoo("module.exports = function foo() { return 'got foo v2'; };");
      helper.fixtures.tagComponentBarFoo();
      output = helper.command.runCmd('bit status');
    });
    it('should not display that component as modified', () => {
      expect(output.includes('modified components')).to.be.false;
    });
    it('should display that component as a staged component with version 0.0.2', () => {
      expect(output.includes('staged components')).to.be.true;
      expect(output.includes('bar/foo. versions: 0.0.2')).to.be.true;
    });
    it('should not display that component as new', () => {
      expect(output.includes('new components')).to.be.false;
    });
  });
  describe('when a component is exported, modified, tagged and then exported again', () => {
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportComponent('bar/foo');
      helper.fixtures.createComponentBarFoo("module.exports = function foo() { return 'got foo v2'; };"); // modify the component
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportComponent('bar/foo');
      output = helper.command.runCmd('bit status');
    });
    it('should not display that component as modified', () => {
      expect(output.includes('modified components')).to.be.false;
    });
    it('should not display that component as staged', () => {
      expect(output.includes('staged components')).to.be.false;
    });
    it('should not display that component as new', () => {
      expect(output.includes('new components')).to.be.false;
    });
  });
  describe('when a component is imported', () => {
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportComponent('bar/foo');
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
      output = helper.command.runCmd('bit status');
    });
    it('should not display that component as new', () => {
      expect(output.includes('new components')).to.be.false;
    });
    it('should not display that component as modified', () => {
      expect(output.includes('modified components')).to.be.false;
    });
    it('should not display that component as staged', () => {
      expect(output.includes('staged components')).to.be.false;
    });
    describe('and then all objects were deleted', () => {
      before(() => {
        fs.removeSync(path.join(helper.scopes.localPath, '.bit'));
        helper.scopeHelper.initWorkspace();
      });
      it('should indicate that running "bit import" should solve the issue', () => {
        output = helper.command.runCmd('bit status');
        expect(output).to.have.string(IMPORT_PENDING_MSG);
      });
    });
  });
  describe('when a component is imported tagged and modified again', () => {
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('', 'file.js');
      helper.command.addComponent('file.js', { i: 'comp/comp' });
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('comp/comp');
      const filefixture = '//some change to file';
      helper.fs.createFile('components/comp/comp', 'file.js', filefixture);
      helper.command.tagComponent('comp/comp');
      const filefixture2 = '//some other change to file';
      helper.fs.createFile('components/comp/comp', 'file.js', filefixture2);
      output = helper.command.runCmd('bit status');
    });
    it('should not display that component as new', () => {
      expect(output.includes('new components')).to.be.false;
    });
    it('should display that component as a modified component', () => {
      expect(output.includes('no modified components')).to.be.false;

      expect(output.includes('modified components')).to.be.true;
      expect(output.includes('comp/comp')).to.be.true;
    });
  });

  describe('when a component has a dependency and both were tagged', () => {
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithTwoComponents();
      helper.command.tagAllComponents();
      output = helper.command.runCmd('bit status');
    });
    it('should not display any component as new', () => {
      expect(output.includes('new components')).to.be.false;
    });
    it('should not display any component as modified', () => {
      expect(output.includes('modified components')).to.be.false;
    });
    it('should display both components as staged', () => {
      expect(output.includes('staged components')).to.be.true;
      expect(output.includes('utils/is-type')).to.be.true;
      expect(output.includes('utils/is-string')).to.be.true;
    });
  });
  describe('when a component has an imported dependency', () => {
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithUtilsIsType();
      helper.command.tagComponent('utils/is-type');
      helper.command.exportComponent('utils/is-type');
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('utils/is-type');

      const isStringFixture =
        "import isType from '../components/utils/is-type'; module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.fs.createFile('utils', 'is-string.js', isStringFixture);
      helper.fixtures.addComponentUtilsIsString();
      output = helper.command.runCmd('bit status');
    });
    it('should not display missing files for the imported component', () => {
      expect(output).to.not.have.string('The following files dependencies are not tracked by bit');
      expect(output).to.not.have.string('components/utils/is-type/index.js');
      expect(output).to.not.have.string('components/utils/is-type/utils/is-type.js');
    });
  });
  describe('when a component with multi files and dependency is imported', () => {
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithUtilsIsType();
      helper.command.tagComponent('utils/is-type');

      const isStringInternalFixture =
        "import isType from './is-type'; module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.fs.createFile('utils', 'is-string-internal.js', isStringInternalFixture);
      const isStringFixture = "import iString from './is-string-internal';";
      helper.fs.createFile('utils', 'is-string.js', isStringFixture);
      helper.command.addComponent('utils/is-string.js utils/is-string-internal.js', {
        m: 'utils/is-string.js',
        i: 'utils/is-string',
      });
      helper.command.tagComponent('utils/is-string');
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('utils/is-string');
      output = helper.command.runCmd('bit status');
    });
    it('should not show imported component as modified', () => {
      expect(output.includes('modified components')).to.be.false;
    });
  });
  describe('when a component is exported, modified and the project cloned somewhere else', () => {
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportComponent('bar/foo');
      helper.fixtures.createComponentBarFoo("module.exports = function foo() { return 'got foo v2'; };"); // modify the component
      helper.git.mimicGitCloneLocalProject(false);
      helper.scopeHelper.addRemoteScope();
      helper.command.runCmd('bit import --merge');
      output = helper.command.runCmd('bit status');
    });
    it('should display that component as a modified component', () => {
      // this also makes sure that bit install does not override existing files
      expect(output.includes('no modified components')).to.be.false;

      expect(output.includes('modified components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
    });
    it('should not display that component as staged', () => {
      expect(output.includes('staged components')).to.be.false;
    });
    it('should not display that component as new', () => {
      expect(output.includes('new components')).to.be.false;
    });
  });
  describe('with corrupted bit.json', () => {
    let output;
    before(() => {
      helper.scopeHelper.initNewLocalScope();
      helper.fixtures.createComponentBarFoo();
    });
    it('Should not show status if bit.json is corrupted', () => {
      helper.bitJson.corrupt();
      try {
        helper.command.runCmd('bit status');
      } catch (err) {
        output = err.toString();
      }
      expect(output).to.include('error: invalid bit.json: ');
      expect(output).to.include(`${path.join(helper.scopes.localPath, 'bit.json')}`);
    });
  });
  describe('when component files were deleted', () => {
    describe('when some of the files were deleted', () => {
      before(() => {
        helper.scopeHelper.initNewLocalScope();
        helper.fixtures.createComponentBarFoo();
        helper.fs.createFile('bar', 'index.js');
        helper.command.addComponent('bar/', { i: 'bar/foo' });
        helper.fs.deletePath('bar/foo.js');
      });
      it('should remove the files from bit.map', () => {
        const beforeRemoveBitMap = helper.bitMap.read();
        const beforeRemoveBitMapFiles = beforeRemoveBitMap['bar/foo'].files;
        expect(beforeRemoveBitMapFiles).to.be.ofSize(2);
        helper.command.runCmd('bit status');
        const bitMap = helper.bitMap.read();
        const files = bitMap['bar/foo'].files;
        expect(files).to.be.ofSize(1);
        expect(files[0].name).to.equal('index.js');
      });
      it('Should show "non-existing dependency" when deleting a file that is required by other files', () => {
        helper.fs.createFile('bar', 'foo1.js');
        helper.fs.createFile('bar', 'foo2.js', 'var index = require("./foo1.js")');
        helper.command.addComponent('bar/', { i: 'bar/foo' });
        helper.fs.deletePath('bar/foo1.js');
        const output = helper.command.runCmd('bit status');
        expect(output).to.have.string('non-existing dependency files');
        expect(output).to.have.string('bar/foo2.js -> ./foo1.js');
      });
      describe('when mainFile is deleted', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          helper.fs.createFile('bar', 'index.js');
          helper.fs.createFile('bar', 'foo.js');
          helper.command.addComponent('bar/', { i: 'bar/foo' });
          helper.fs.deletePath('bar/index.js');
        });
        it('should show an error indicating the mainFile was deleting', () => {
          const output = helper.command.runCmd('bit status');
          expect(output).to.have.string(statusInvalidComponentsMsg);
          expect(output).to.have.string('main-file was removed');
        });
      });
    });
    describe('when all of the files were deleted', () => {
      let output;
      before(() => {
        helper.scopeHelper.initNewLocalScope();
        helper.fixtures.createComponentBarFoo();
        helper.fs.createFile('bar', 'index.js');
        helper.command.addComponent('bar/', { i: 'bar/foo' });
        helper.fs.deletePath('bar/index.js');
        helper.fs.deletePath('bar/foo.js');
        output = helper.command.runCmd('bit status');
      });
      it('should not delete the files from bit.map', () => {
        const beforeRemoveBitMap = helper.bitMap.read();
        const beforeRemoveBitMapfiles = beforeRemoveBitMap['bar/foo'].files;
        expect(beforeRemoveBitMapfiles).to.be.ofSize(2);
      });
      it('should not display that component as a modified component', () => {
        expect(output.includes('modified components')).to.be.false;
      });
      it('should not display that component as a staged component', () => {
        expect(output.includes('staged components')).to.be.false;
      });
      it('should not display that component as new', () => {
        expect(output.includes('new components')).to.be.false;
      });
      it('should display that component as deleted component', () => {
        expect(output).to.have.string('component files were deleted');
      });
      describe('running bit diff', () => {
        it('should throw an exception MissingFilesFromComponent', () => {
          const diffFunc = () => helper.command.diff('bar/foo');
          const error = new MissingFilesFromComponent('bar/foo');
          helper.general.expectToThrow(diffFunc, error);
        });
      });
    });
    describe('when the trackDir was deleted for author', () => {
      let output;
      before(() => {
        helper.scopeHelper.initNewLocalScope();
        helper.fixtures.createComponentBarFoo();
        helper.fs.createFile('bar', 'index.js');
        helper.command.addComponent('bar/', { i: 'bar/foo' });
        helper.fs.deletePath('bar');
        output = helper.command.runCmd('bit status');
      });
      it('should not delete the files from bit.map', () => {
        const beforeRemoveBitMap = helper.bitMap.read();
        const beforeRemoveBitMapfiles = beforeRemoveBitMap['bar/foo'].files;
        expect(beforeRemoveBitMapfiles).to.be.ofSize(2);
      });
      it('should not display that component as a modified component', () => {
        expect(output.includes('modified components')).to.be.false;
      });
      it('should not display that component as a staged component', () => {
        expect(output.includes('staged components')).to.be.false;
      });
      it('should not display that component as new', () => {
        expect(output.includes('new components')).to.be.false;
      });
      it('should display that component as deleted component', () => {
        expect(output).to.have.string('component files were deleted');
      });
      describe('running bit diff', () => {
        it('should throw an exception ComponentNotFoundInPath', () => {
          const diffFunc = () => helper.command.diff('bar/foo');
          const error = new ComponentNotFoundInPath('bar');
          helper.general.expectToThrow(diffFunc, error);
        });
      });
    });
  });
  describe('when a component requires a missing component with absolute syntax (require bit/component-name)', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      const fooFixture = "require ('@bit/scope.bar.baz');";
      helper.fixtures.createComponentBarFoo(fooFixture);
      helper.fixtures.addComponentBarFoo();
      output = helper.command.runCmd('bit status');
    });
    it('should show the missing component as missing', () => {
      expect(output).to.have.string('missing components');
      expect(output).to.have.string('bar/foo.js -> scope.bar/baz');
    });
  });
  describe('when a component requires a missing bit component that exists on package.json', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      const fooFixture = "require ('@bit/scope.bar.baz');";
      helper.fixtures.createComponentBarFoo(fooFixture);
      helper.fixtures.addComponentBarFoo();
      helper.npm.initNpm();
      helper.packageJson.addKeyValue({ dependencies: { '@bit/scope.bar.baz': '1.0.0' } });
    });
    it('should show the bit package as missing', () => {
      const status = helper.command.statusJson();
      expect(status.componentsWithIssues).to.have.lengthOf(1);
    });
  });
  /**
   * this has been written due to the following bug:
   * when Bit resolves dependencies of a component, the data is saved in the cache for the next
   * component, in case it uses some files from the previous components.
   * the bug with the cache was that it didn't save the missing files only the found dependencies.
   * as a result, if a component has missing files and it has been retrieved from the cache, bit
   * status didn't show the component with the missing data.
   */
  describe('when a component has missing files and its dependencies are resolved from the cache', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentUtilsIsString();
      helper.fixtures.createComponentBarFoo(fixtures.barFooFixture);
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.addComponentUtilsIsString();

      // an intermediate step, make sure bar/foo is before utils/is-string
      // so then when bit-javascript resolves dependencies of utils/is-string it finds them in the
      // cache
      const bitMap = helper.bitMap.readComponentsMapOnly();
      const components = Object.keys(bitMap);
      expect(components[0]).to.equal('bar/foo');
      expect(components[1]).to.equal('utils/is-string');

      output = helper.command.status();
    });
    it('should show missing utils/is-type', () => {
      expect(output).to.have.string('non-existing dependency files');
      expect(output).to.have.string('utils/is-string.js -> ./is-type.js');
    });
  });
  describe('dynamic import', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo('const a = "./b"; import(a); require(a);');
      helper.fixtures.addComponentBarFoo();
    });
    it('status should not show the component as missing packages', () => {
      const output = helper.command.runCmd('bit status');
      expect(output).to.not.have.string(statusFailureMsg);
    });
  });
});
