import path from 'path';
import fs from 'fs-extra';
import chai, { expect } from 'chai';
import Helper from '../e2e-helper';
import MissingFilesFromComponent from '../../src/consumer/component/exceptions/missing-files-from-component';
import ComponentNotFoundInPath from '../../src/consumer/component/exceptions/component-not-found-in-path';
import { statusInvalidComponentsMsg, statusWorkspaceIsCleanMsg } from '../../src/cli/commands/public-cmds/status-cmd';

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('bit status command', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('before running "bit init" with .bit.map.json', () => {
    it('Should init consumer add then run  status ', () => {
      helper.createBitMap();
      helper.createFile('bar', 'foo.js');
      const output = helper.runCmd('bit status');
      expect(output).to.include('bar/foo');
    });
  });
  describe('when no components created', () => {
    before(() => {
      helper.cleanEnv();
      helper.runCmd('bit init');
    });
    it('should indicate that there are no components', () => {
      const output = helper.runCmd('bit status');
      expect(output).to.have.a.string(statusWorkspaceIsCleanMsg);
    });
  });

  describe('when a component is created in components directory but not added', () => {
    before(() => {
      helper.cleanEnv();
      helper.runCmd('bit init');
      helper.createFile(path.join('components', 'bar'), 'foo.js');
    });
    it('should indicate that there are no components and should not throw an error', () => {
      const output = helper.runCmd('bit status');
      expect(output).to.have.a.string(statusWorkspaceIsCleanMsg);
    });
  });
  describe('when a component is created and added but not committed', () => {
    let output;
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      output = helper.runCmd('bit status');
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
      helper.reInitLocalScope();
      helper.createFile();
      helper.createFile('bar', 'foo2.js', 'var foo = require("./foo.js")');
      helper.addComponent('bar/foo2.js', { i: 'bar/foo2' });
    });
    it('Should show missing dependencies', () => {
      output = helper.runCmd('bit status');
      expect(output).to.have.string('untracked file dependencies');
      expect(output).to.have.string('bar/foo2.js -> bar/foo.js');
    });
  });
  describe('when a component is created and added without its package dependencies', () => {
    let output;
    before(() => {
      helper.reInitLocalScope();
      helper.createFile('bar', 'foo.js', 'var React = require("react")');
      helper.addComponentBarFoo();
    });
    it('Should show missing package dependencies', () => {
      output = helper.runCmd('bit status');
      expect(output).to.have.string('missing packages dependencies');
      expect(output).to.have.string('bar/foo.js -> react');
    });
  });
  describe('when a component is created, added and committed', () => {
    let output;
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      output = helper.runCmd('bit status');
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
  describe('when a component is modified after commit', () => {
    let output;
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      // modify the component
      helper.createComponentBarFoo("module.exports = function foo() { return 'got foo v2'; };");
      output = helper.runCmd('bit status');
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
  describe('when a component is created, added, committed and exported', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.exportComponent('bar/foo');
      output = helper.runCmd('bit status');
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
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.exportComponent('bar/foo');
      // modify the component
      helper.createComponentBarFoo("module.exports = function foo() { return 'got foo v2'; };");
      output = helper.runCmd('bit status');
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
  describe('when a component is exported, modified and then committed', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.exportComponent('bar/foo');
      // modify the component
      helper.createComponentBarFoo("module.exports = function foo() { return 'got foo v2'; };");
      helper.commitComponentBarFoo();
      output = helper.runCmd('bit status');
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
  describe('when a component is exported, modified, committed and then exported again', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.exportComponent('bar/foo');
      helper.createComponentBarFoo("module.exports = function foo() { return 'got foo v2'; };"); // modify the component
      helper.commitComponentBarFoo();
      helper.exportComponent('bar/foo');
      output = helper.runCmd('bit status');
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
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.exportComponent('bar/foo');
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
      output = helper.runCmd('bit status');
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
        fs.removeSync(path.join(helper.localScopePath, '.bit'));
        helper.runCmd('bit init');
      });
      it('should indicate that running "bit import" should solve the issue', () => {
        output = helper.runCmd('bit status');
        expect(output).to.have.string(
          'your workspace has outdated objects. please use "bit import" to pull the latest objects from the remote scope.\n'
        );
      });
    });
  });
  describe('when a component is imported committed and modified again', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('', 'file.js');
      helper.addComponent('file.js', { i: 'comp/comp' });
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('comp/comp');
      const filefixture = '//some change to file';
      helper.createFile('components/comp/comp', 'file.js', filefixture);
      helper.commitComponent('comp/comp');
      const filefixture2 = '//some other change to file';
      helper.createFile('components/comp/comp', 'file.js', filefixture2);
      output = helper.runCmd('bit status');
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

  describe('when a component has a dependency and both were committed', () => {
    let output;
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
      output = helper.runCmd('bit status');
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
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createFile('utils', 'is-type.js', isTypeFixture);
      helper.addComponentUtilsIsType();
      helper.commitComponent('utils/is-type');
      helper.exportComponent('utils/is-type');
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-type');

      const isStringFixture =
        "import isType from '../components/utils/is-type'; module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createFile('utils', 'is-string.js', isStringFixture);
      helper.addComponentUtilsIsString();
      output = helper.runCmd('bit status');
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
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createFile('utils', 'is-type.js', isTypeFixture);
      helper.addComponentUtilsIsType();
      helper.commitComponent('utils/is-type');

      const isStringInternalFixture =
        "import isType from './is-type'; module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createFile('utils', 'is-string-internal.js', isStringInternalFixture);
      const isStringFixture = "import iString from './is-string-internal';";
      helper.createFile('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js utils/is-string-internal.js', {
        m: 'utils/is-string.js',
        i: 'utils/is-string'
      });
      helper.commitComponent('utils/is-string');
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-string');
      output = helper.runCmd('bit status');
    });
    it('should not show imported component as modified', () => {
      expect(output.includes('modified components')).to.be.false;
    });
  });
  describe('when a component is exported, modified and the project cloned somewhere else', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.exportComponent('bar/foo');
      helper.createComponentBarFoo("module.exports = function foo() { return 'got foo v2'; };"); // modify the component
      helper.mimicGitCloneLocalProject(false);
      helper.addRemoteScope();
      helper.runCmd('bit import --merge');
      output = helper.runCmd('bit status');
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
      helper.initNewLocalScope();
      helper.createComponentBarFoo();
    });
    it('Should not show status if bit.json is corrupted', () => {
      helper.corruptBitJson();
      try {
        helper.runCmd('bit status');
      } catch (err) {
        output = err.toString();
      }
      expect(output).to.include('error: invalid bit.json: ');
      expect(output).to.include(`${path.join(helper.localScopePath, 'bit.json')}`);
    });
  });
  describe('when component files were deleted', () => {
    describe('when some of the files were deleted', () => {
      before(() => {
        helper.initNewLocalScope();
        helper.createComponentBarFoo();
        helper.createFile('bar', 'index.js');
        helper.addComponent('bar/', { i: 'bar/foo' });
        helper.deleteFile('bar/foo.js');
      });
      it('should remove the files from bit.map', () => {
        const beforeRemoveBitMap = helper.readBitMap();
        const beforeRemoveBitMapFiles = beforeRemoveBitMap['bar/foo'].files;
        expect(beforeRemoveBitMapFiles).to.be.ofSize(2);
        helper.runCmd('bit status');
        const bitMap = helper.readBitMap();
        const files = bitMap['bar/foo'].files;
        expect(files).to.be.ofSize(1);
        expect(files[0].name).to.equal('index.js');
      });
      it('Should show "non-existing dependency" when deleting a file that is required by other files', () => {
        helper.createFile('bar', 'foo1.js');
        helper.createFile('bar', 'foo2.js', 'var index = require("./foo1.js")');
        helper.addComponent('bar/', { i: 'bar/foo' });
        helper.deleteFile('bar/foo1.js');
        const output = helper.runCmd('bit status');
        expect(output).to.have.string('non-existing dependency files');
        expect(output).to.have.string('bar/foo2.js -> ./foo1.js');
      });
      describe('when mainFile is deleted', () => {
        before(() => {
          helper.reInitLocalScope();
          helper.createFile('bar', 'index.js');
          helper.createFile('bar', 'foo.js');
          helper.addComponent('bar/', { i: 'bar/foo' });
          helper.deleteFile('bar/index.js');
        });
        it('should show an error indicating the mainFile was deleting', () => {
          const output = helper.runCmd('bit status');
          expect(output).to.have.string(statusInvalidComponentsMsg);
          expect(output).to.have.string('main-file was removed');
        });
      });
    });
    describe('when all of the files were deleted', () => {
      let output;
      before(() => {
        helper.initNewLocalScope();
        helper.createComponentBarFoo();
        helper.createFile('bar', 'index.js');
        helper.addComponent('bar/', { i: 'bar/foo' });
        helper.deleteFile('bar/index.js');
        helper.deleteFile('bar/foo.js');
        output = helper.runCmd('bit status');
      });
      it('should not delete the files from bit.map', () => {
        const beforeRemoveBitMap = helper.readBitMap();
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
          const diffFunc = () => helper.diff('bar/foo');
          const error = new MissingFilesFromComponent('bar/foo');
          helper.expectToThrow(diffFunc, error);
        });
      });
    });
    describe('when the trackDir was deleted for author', () => {
      let output;
      before(() => {
        helper.initNewLocalScope();
        helper.createComponentBarFoo();
        helper.createFile('bar', 'index.js');
        helper.addComponent('bar/', { i: 'bar/foo' });
        helper.deleteFile('bar');
        output = helper.runCmd('bit status');
      });
      it('should not delete the files from bit.map', () => {
        const beforeRemoveBitMap = helper.readBitMap();
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
          const diffFunc = () => helper.diff('bar/foo');
          const error = new ComponentNotFoundInPath('bar');
          helper.expectToThrow(diffFunc, error);
        });
      });
    });
  });
  describe('when a component requires a missing component with absolute syntax (require bit/component-name)', () => {
    let output;
    before(() => {
      helper.reInitLocalScope();
      const fooFixture = "require ('@bit/scope.bar.baz');";
      helper.createComponentBarFoo(fooFixture);
      helper.addComponentBarFoo();
      output = helper.runCmd('bit status');
    });
    it('should show the missing component as missing', () => {
      expect(output).to.have.string('missing components');
      expect(output).to.have.string('bar/foo.js -> scope.bar/baz');
    });
  });
});
