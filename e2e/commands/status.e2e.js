import { expect } from 'chai';
import Helper, { VERSION_DELIMITER } from '../e2e-helper';

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
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.reInitRemoteScope();
      helper.addRemoteScope();
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
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.reInitRemoteScope();
      helper.addRemoteScope();
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
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.reInitRemoteScope();
      helper.addRemoteScope();
      helper.exportComponent('bar/foo');
      // modify the component
      helper.createComponentBarFoo("module.exports = function foo() { return 'got foo v2'; };");
      helper.commitComponentBarFoo();
      output = helper.runCmd('bit status');
    });
    it('should not display that component as modified', () => {
      expect(output.includes('no modified components')).to.be.true;
    });
    it('should display that component as a staged component with version 2', () => {
      expect(output.includes('no staged components')).to.be.false;

      expect(output.includes('staged components')).to.be.true;
      expect(output.includes(`bar/foo${VERSION_DELIMITER}2`)).to.be.true;
    });
    it('should not display that component as new', () => {
      expect(output.includes('no new components')).to.be.true;
    });
  });
  describe('when a component is exported, modified, committed and then exported again', () => {
    let output;
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.reInitRemoteScope();
      helper.addRemoteScope();
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
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.reInitRemoteScope();
      helper.addRemoteScope();
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
  describe('when a component has a dependency and both were committed', () => {
    let output;
    before(() => {
      helper.reInitLocalScope();
      helper.reInitRemoteScope();
      helper.addRemoteScope();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      const isStringFixture = "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
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
      helper.reInitLocalScope();
      helper.reInitRemoteScope();
      helper.addRemoteScope();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      helper.commitComponent('utils/is-type');
      helper.exportComponent('utils/is-type');
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-type');

      const isStringFixture = "import isType from '../components/utils/is-type'; module.exports = function isString() { return isType() +  ' and got is-string'; };";
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
  describe('when a component is exported, modified and the project cloned somewhere else', () => {
    let output;
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.reInitRemoteScope();
      helper.addRemoteScope();
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
});
