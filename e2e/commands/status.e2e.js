import path from 'path';
import chai, { expect } from 'chai';
import Helper, { VERSION_DELIMITER } from '../e2e-helper';

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('bit status command', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('when no components created', () => {
    before(() => {
      helper.cleanEnv();
      helper.runCmd('bit init');
    });
    it('should indicate that there are no components', () => {
      const output = helper.runCmd('bit status');
      expect(output.includes('no new components')).to.be.true;
      expect(output.includes('no modified components')).to.be.true;
      expect(output.includes('no staged components')).to.be.true;
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
      expect(output.includes('no new components')).to.be.true;
      expect(output.includes('no modified components')).to.be.true;
      expect(output.includes('no staged components')).to.be.true;
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
      expect(output.includes('no new components')).to.be.false;

      expect(output.includes('new components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
    });
    it('should not display that component as modified', () => {
      expect(output.includes('no modified components')).to.be.true;
    });
    it('should not display that component as staged', () => {
      expect(output.includes('no staged components')).to.be.true;
    });
  });
  describe('when a component is created and added without its dependencies', () => {
    let output;
    before(() => {
      helper.reInitLocalScope();
      helper.createFile();
      helper.createFile('bar', 'foo2.js', 'var foo = require("./foo.js")');
      helper.addComponent('bar/foo2.js');
    });
    it('Should show missing dependencies', () => {
      output = helper.runCmd('bit status');
      expect(output).to.have.string('untracked file dependencies: bar/foo.js');
    });
  });
  describe('when a component is created and added without its package dependencies', () => {
    let output;
    before(() => {
      helper.reInitLocalScope();
      helper.createFile('bar', 'foo.js', 'var React = require("react")');
      helper.addComponent('bar/foo.js');
    });
    it('Should show missing package dependencies', () => {
      output = helper.runCmd('bit status');
      expect(output).to.have.string('missing packages dependencies: react');
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
      expect(output.includes('no modified components')).to.be.true;
    });
    it('should not display that component as new', () => {
      expect(output.includes('no new components')).to.be.true;
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
      expect(output.includes('new components')).to.be.true;
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
      expect(output.includes('no new components')).to.be.true;
    });
    it('should not display that component as modified', () => {
      expect(output.includes('no modified components')).to.be.true;
    });
    it('should not display that component as staged', () => {
      expect(output.includes('no staged components')).to.be.true;
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
      expect(output.includes('no staged components')).to.be.true;
    });
    it('should not display that component as new', () => {
      expect(output.includes('no new components')).to.be.true;
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
      expect(output.includes('no modified components')).to.be.true;
    });
    it('should display that component as a staged component with version 0.0.2', () => {
      expect(output.includes('no staged components')).to.be.false;

      expect(output.includes('staged components')).to.be.true;
      expect(output.includes(`bar/foo${VERSION_DELIMITER}0.0.2`)).to.be.true;
    });
    it('should not display that component as new', () => {
      expect(output.includes('no new components')).to.be.true;
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
      expect(output.includes('no modified components')).to.be.true;
    });
    it('should not display that component as staged', () => {
      expect(output.includes('no staged components')).to.be.true;
    });
    it('should not display that component as new', () => {
      expect(output.includes('no new components')).to.be.true;
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
      expect(output.includes('no new components')).to.be.true;
    });
    it('should not display that component as modified', () => {
      expect(output.includes('no modified components')).to.be.true;
    });
    it('should not display that component as staged', () => {
      expect(output.includes('no staged components')).to.be.true;
    });
  });
  describe('when a component is imported committed and modified again', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('', 'file.js');
      helper.addComponentWithOptions('file.js', { i: 'comp/comp' });
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
      expect(output.includes('no new components')).to.be.true;
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
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      helper.commitAllComponents();
      output = helper.runCmd('bit status');
    });
    it('should not display any component as new', () => {
      expect(output.includes('no new components')).to.be.true;
    });
    it('should not display any component as modified', () => {
      expect(output.includes('no modified components')).to.be.true;
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
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      helper.commitComponent('utils/is-type');
      helper.exportComponent('utils/is-type');
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-type');

      const isStringFixture =
        "import isType from '../components/utils/is-type'; module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
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
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      helper.commitComponent('utils/is-type');

      const isStringInternalFixture =
        "import isType from './is-type'; module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createFile('utils', 'is-string-internal.js', isStringInternalFixture);
      const isStringFixture = "import iString from './is-string-internal';";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponentWithOptions('utils/is-string.js utils/is-string-internal.js', {
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
      expect(output.includes('no modified components')).to.be.true;
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
      helper.mimicGitCloneLocalProject();
      output = helper.runCmd('bit status');
    });
    it('should display that component as a modified component', () => {
      // this also makes sure that bit install does not override existing files
      expect(output.includes('no modified components')).to.be.false;

      expect(output.includes('modified components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
    });
    it('should not display that component as staged', () => {
      expect(output.includes('no staged components')).to.be.true;
    });
    it('should not display that component as new', () => {
      expect(output.includes('no new components')).to.be.true;
    });
  });
  describe('with corrupted bit.json', () => {
    before(() => {
      helper.initNewLocalScope();
      helper.createComponentBarFoo();
    });
    it('Should not show status if bit.json is corrupted', () => {
      helper.corruptBitJson();
      const statusCmd = () => helper.runCmd('bit status');
      expect(statusCmd).to.throw(
        'error: invalid bit.json: SyntaxError: Unexpected token o in JSON at position 1 is not a valid JSON file.'
      );
    });
  });
  describe('when component files were deleted', () => {
    describe('when some of the files were deleted', () => {
      before(() => {
        helper.initNewLocalScope();
        helper.createComponentBarFoo();
        helper.createComponent('bar', 'index.js');
        helper.addComponentWithOptions('bar/', { i: 'bar/foo' });
        helper.deleteFile('bar/foo.js');
      });
      it('should remove the files from bit.map', () => {
        const beforeRemoveBitMap = helper.readBitMap();
        const beforeRemoveBitMapfiles = beforeRemoveBitMap['bar/foo'].files;
        expect(beforeRemoveBitMapfiles).to.be.ofSize(2);
        helper.runCmd('bit status');
        const bitMap = helper.readBitMap();
        const files = bitMap['bar/foo'].files;
        expect(files).to.be.ofSize(1);
        expect(files[0].name).to.equal('index.js');
      });
      it('Should show "non-existing dependency" when deleting a file that is required by other files', () => {
        helper.createComponent('bar', 'foo.js', 'var index = require("./index.js")');
        helper.addComponentWithOptions('bar/', { i: 'bar/foo' });
        helper.deleteFile('bar/index.js');
        const output = helper.runCmd('bit status');
        expect(output).to.have.string('non-existing dependency files: ./index.js');
      });
    });
    describe('when all of the files were deleted', () => {
      let output;
      before(() => {
        helper.initNewLocalScope();
        helper.createComponentBarFoo();
        helper.createComponent('bar', 'index.js');
        helper.addComponentWithOptions('bar/', { i: 'bar/foo' });
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
        expect(output.includes('no modified components')).to.be.true;
      });
      it('should not display that component as a staged component', () => {
        expect(output.includes('no staged components')).to.be.true;
      });
      it('should not display that component as new', () => {
        expect(output.includes('no new components')).to.be.true;
      });
      it('should display that component as deleted component', () => {
        expect(output.includes('deleted components')).to.be.true;
        expect(output.includes('no deleted components')).to.be.false;
      });
    });
  });
  // @todo: fix this along with 'import component is-type as a dependency of is-string and then import is-type directly' e2e-test.
  describe.skip('after importing a component that uses a dependency with relative-path', () => {
    let output;
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
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-string');
      helper.importComponent('utils/is-type');
      output = helper.runCmd('bit status');
    });
    it('should not show the main component as missing dependencies', () => {
      expect(output.includes('missing dependencies')).to.be.false;
    });
    it('should not display any component as new', () => {
      expect(output.includes('no new components')).to.be.true;
    });
    it('should not display any component as modified', () => {
      expect(output.includes('no modified components')).to.be.true;
    });
    it('should not display any component as staged', () => {
      expect(output.includes('no staged components')).to.be.true;
    });
  });
  describe('when a component requires a missing component with absolute syntax (require bit/component-name)', () => {
    let output;
    before(() => {
      helper.reInitLocalScope();
      const fooFixture = "require ('bit/bar/baz');";
      helper.createComponentBarFoo(fooFixture);
      helper.addComponentBarFoo();
      output = helper.runCmd('bit status');
    });
    it('should show the missing component as missing', () => {
      expect(output).to.have.string('missing components: bar/baz');
    });
  });
});
