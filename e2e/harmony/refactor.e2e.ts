import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('bit refactor command and flag', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('refactoring with refactor command', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.rename('comp2', 'new-comp2');
    });
    it('should throw when specifying the non-exist component-id', () => {
      expect(() => helper.command.refactorDependencyName('comp2', 'new-comp2')).to.throw(
        'refactoring: the id "comp2" is neither a valid scoped-package-name nor an existing component-id'
      );
    });
    it('should change the dependency in the source code to the new package-name', () => {
      helper.command.refactorDependencyName(`@${helper.scopes.remote}/comp2`, 'new-comp2');
      const file = helper.fs.readFile('comp1/index.js');
      expect(file).to.have.string('new-comp2');
    });
  });
  describe('rename a new component with --refactor flag', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.rename('comp2', 'new-comp2', '--refactor');
    });
    it('should change the dependency in the source code to the new package-name', () => {
      const file = helper.fs.readFile('comp1/index.js');
      expect(file).to.have.string('new-comp2');
    });
  });
  describe('rename an exported component with --refactor flag', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.rename('comp2', 'new-comp2', '--refactor');
    });
    it('should change the dependency in the source code to the new package-name', () => {
      const file = helper.fs.readFile('comp1/index.js');
      expect(file).to.have.string('new-comp2');
    });
  });
  describe('fork command with --refactor flag', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
    });
    describe('fork a local component', () => {
      before(() => {
        helper.command.fork('comp2 forked-comp2 --refactor');
      });
      it('should change the dependency in the source code to the new package-name', () => {
        const file = helper.fs.readFile('comp1/index.js');
        expect(file).to.have.string('forked-comp2');
      });
    });
    describe('fork a remote component with no --target-id flag', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('comp2');
      });
      it('should throw', () => {
        expect(() => helper.command.fork(`${helper.scopes.remote}/comp1 --refactor`)).to.throw(
          "you can't use the --refactor flag"
        );
      });
    });
  });
});
