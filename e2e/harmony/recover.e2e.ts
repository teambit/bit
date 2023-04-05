import { IssuesClasses } from '@teambit/component-issues';
import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('bit recover command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('recover before snapping', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagWithoutBuild();
      helper.command.export();

      helper.command.softRemoveComponent('comp2');
      helper.command.recover('comp2');
    });
    it('bit status should not show a section of removed components', () => {
      const status = helper.command.statusJson();
      expect(status.locallySoftRemoved).to.have.lengthOf(0);
    });
    it('bit status should not show the dependent component with an issue because the dependency is now back to the workspace', () => {
      helper.command.expectStatusToNotHaveIssue(IssuesClasses.MissingPackagesDependenciesOnFs.name);
    });
    it('bit list should show the removed component', () => {
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(2);
    });
  });
  describe('recover after snapping', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagWithoutBuild();
      helper.command.export();

      helper.command.softRemoveComponent('comp2');
      helper.fs.outputFile('comp1/index.js', '');
      helper.command.tagAllWithoutBuild();
      helper.command.recover(`${helper.scopes.remote}/comp2`);
    });
    it('should put it back in .bitmap file', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap.comp2).to.not.be.undefined;
    });
    it('bit status should not show the component as remotelySoftRemoved', () => {
      const status = helper.command.statusJson();
      expect(status.remotelySoftRemoved).to.have.lengthOf(0);
    });
    it('bit list should show the component', () => {
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(2);
    });
    it('bit status should show the component as modified because the RemoveAspect has changed', () => {
      const isModified = helper.command.statusComponentIsModified(`${helper.scopes.remote}/comp2@0.0.2`);
      expect(isModified).to.be.true;
    });
  });
  describe('export the soft-remove component, start a new workspace and recover from there', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagWithoutBuild();
      helper.command.export();

      helper.command.softRemoveComponent('comp2');
      helper.fs.outputFile('comp1/index.js', '');
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.recover(`${helper.scopes.remote}/comp2`);
    });
    it('should import the component', () => {
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(1);

      helper.bitMap.expectToHaveId('comp2');
    });
    it('bit status should show the component as modified because the RemoveAspect has changed', () => {
      const isModified = helper.command.statusComponentIsModified(`${helper.scopes.remote}/comp2@0.0.2`);
      expect(isModified).to.be.true;
    });
  });
  describe('import soft-removed component', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagWithoutBuild();
      helper.command.export();

      helper.command.softRemoveComponent('comp2');
      helper.fs.outputFile('comp1/index.js', '');
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('comp2', '-x');
    });
    it('bit status should show the component as soft-removed', () => {
      const status = helper.command.statusJson();
      expect(status.remotelySoftRemoved).to.have.lengthOf(1);
    });
    it('bit status should not show the component as modified', () => {
      const isModified = helper.command.statusComponentIsModified(`${helper.scopes.remote}/comp2@0.0.2`);
      expect(isModified).to.be.false;
    });
    describe('recover the component', () => {
      before(() => {
        helper.command.recover(`comp2`);
      });
      it('should make the component modified', () => {
        const isModified = helper.command.statusComponentIsModified(`${helper.scopes.remote}/comp2@0.0.2`);
        expect(isModified).to.be.true;
      });
      it('bit status should not show the component as soft-removed anymore', () => {
        const status = helper.command.statusJson();
        expect(status.remotelySoftRemoved).to.have.lengthOf(0);
      });
    });
  });
  describe('recover on a lane', () => {
    describe('recover before snapping', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.command.createLane();
        helper.fixtures.populateComponents(2);
        helper.command.snapAllComponentsWithoutBuild();
        helper.command.export();

        helper.command.softRemoveComponent('comp2');
        helper.command.recover('comp2');
      });
      it('bit status should not show a section of removed components', () => {
        const status = helper.command.statusJson();
        expect(status.locallySoftRemoved).to.have.lengthOf(0);
      });
      it('bit status should not show the dependent component with an issue because the dependency is now back to the workspace', () => {
        helper.command.expectStatusToNotHaveIssue(IssuesClasses.MissingPackagesDependenciesOnFs.name);
      });
      it('bit list should show the removed component', () => {
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(2);
      });
    });
    describe('recover after snapping', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.command.createLane();
        helper.fixtures.populateComponents(2);
        helper.command.snapAllComponentsWithoutBuild();
        helper.command.export();

        helper.command.softRemoveComponent('comp2');
        helper.fs.outputFile('comp1/index.js', '');
        helper.command.snapAllComponentsWithoutBuild();
        helper.command.recover(`${helper.scopes.remote}/comp2`);
      });
      it('should put it back in .bitmap file', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.comp2).to.not.be.undefined;
      });
      it('bit status should not show the component as remotelySoftRemoved', () => {
        const status = helper.command.statusJson();
        expect(status.remotelySoftRemoved).to.have.lengthOf(0);
      });
      it('bit list should show the component', () => {
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(2);
      });
      it('bit status should show the component as modified because the RemoveAspect has changed', () => {
        const head = helper.command.getHeadOfLane('dev', 'comp2');
        const isModified = helper.command.statusComponentIsModified(`${helper.scopes.remote}/comp2@${head}`);
        expect(isModified).to.be.true;
      });
    });
    describe('export the soft-remove component, start a new workspace and recover from there', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.command.createLane();
        helper.fixtures.populateComponents(2);
        helper.command.snapAllComponentsWithoutBuild();
        helper.command.export();

        helper.command.softRemoveComponent('comp2');
        helper.fs.outputFile('comp1/index.js', '');
        helper.command.snapAllComponentsWithoutBuild();
        helper.command.export();

        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importLane(`dev`, '-x');
        helper.command.recover(`${helper.scopes.remote}/comp2`);
      });
      it('should import the component', () => {
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(2);

        helper.bitMap.expectToHaveId('comp2');
      });
      it('bit status should show the component as modified because the RemoveAspect has changed', () => {
        const head = helper.command.getHeadOfLane('dev', 'comp2');
        const isModified = helper.command.statusComponentIsModified(`${helper.scopes.remote}/comp2@${head}`);
        expect(isModified).to.be.true;
      });
    });
  });
});
