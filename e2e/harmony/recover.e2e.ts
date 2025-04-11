import { IssuesClasses } from '@teambit/component-issues';
import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import { Extensions } from '@teambit/legacy.constants';

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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagWithoutBuild();
      helper.command.export();

      helper.command.deleteComponent('comp2');
      helper.command.recover('comp2');
      helper.command.link();
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagWithoutBuild();
      helper.command.export();

      helper.command.deleteComponent('comp2');
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
      const isModified = helper.command.statusComponentIsModified(`${helper.scopes.remote}/comp2`);
      expect(isModified).to.be.true;
    });
  });
  describe('export the soft-remove component, start a new workspace and recover from there', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagWithoutBuild();
      helper.command.export();

      helper.command.deleteComponent('comp2');
      helper.fs.outputFile('comp1/index.js', '');
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.recover(`${helper.scopes.remote}/comp2`);
    });
    it('should import the component', () => {
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(1);

      helper.bitMap.expectToHaveId('comp2');
    });
    it('bit status should show the component as modified because the RemoveAspect has changed', () => {
      const isModified = helper.command.statusComponentIsModified(`${helper.scopes.remote}/comp2`);
      expect(isModified).to.be.true;
    });
  });
  describe('import soft-removed component', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagWithoutBuild();
      helper.command.export();

      helper.command.deleteComponent('comp2');
      helper.fs.outputFile('comp1/index.js', '');
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('comp2', '-x');
    });
    it('bit status should show the component as soft-removed', () => {
      const status = helper.command.statusJson();
      expect(status.remotelySoftRemoved).to.have.lengthOf(1);
    });
    it('bit status should not show the component as modified', () => {
      const isModified = helper.command.statusComponentIsModified(`${helper.scopes.remote}/comp2`);
      expect(isModified).to.be.false;
    });
    describe('recover the component', () => {
      before(() => {
        helper.command.recover(`comp2`);
      });
      it('should make the component modified', () => {
        const isModified = helper.command.statusComponentIsModified(`${helper.scopes.remote}/comp2`);
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
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.command.createLane();
        helper.fixtures.populateComponents(2);
        helper.command.snapAllComponentsWithoutBuild();
        helper.command.export();

        helper.command.softRemoveOnLane('comp2');
        helper.command.recover('comp2');
        // @todo: this should not be needed. the installation during "recover" should create the link correctly.
        // for some reason, the links it creates are incorrect. (@ur256cwd-remote/rgq5tjys-local.comp1 instead of @ur256cwd-remote/comp1)
        helper.command.link();
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
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.command.createLane();
        helper.fixtures.populateComponents(2);
        helper.command.snapAllComponentsWithoutBuild();
        helper.command.export();

        helper.command.softRemoveOnLane('comp2');
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
        const isModified = helper.command.statusComponentIsModified(`${helper.scopes.remote}/comp2`);
        expect(isModified).to.be.true;
      });
    });
    describe('export the soft-remove component, start a new workspace and recover from there', () => {
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.command.createLane();
        helper.fixtures.populateComponents(2);
        helper.command.snapAllComponentsWithoutBuild();
        helper.command.export();

        helper.command.softRemoveOnLane('comp2');
        helper.fs.outputFile('comp1/index.js', '');
        helper.command.snapAllComponentsWithoutBuild();
        helper.command.export();

        helper.scopeHelper.reInitWorkspace();
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
        const isModified = helper.command.statusComponentIsModified(`${helper.scopes.remote}/comp2`);
        expect(isModified).to.be.true;
      });
    });
  });
  describe('remove after recovering', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagWithoutBuild();
      helper.command.export();

      helper.command.deleteComponent('comp2');
      helper.fs.outputFile('comp1/index.js', '');
      helper.command.tagAllWithoutBuild();
      helper.command.recover(`${helper.scopes.remote}/comp2`);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.command.deleteComponent('comp2');
    });
    it('bit show should show the component as removed', () => {
      const removeData = helper.command.showAspectConfig('comp2', Extensions.remove);
      expect(removeData.config.removed).to.be.true;
    });
  });
  describe('remove in one lane, recover in other lane, then merged to the first lane', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(2);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.createLane('lane-b');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();

      helper.command.switchLocalLane('lane-a', '-x');
      helper.command.softRemoveOnLane('comp1');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.switchLocalLane('lane-b', '-x');
      helper.command.mergeLane('lane-a', '-x');
      helper.command.recover(`${helper.scopes.remote}/comp1`);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.switchLocalLane('lane-a', '-x');
      helper.command.mergeLane('lane-b');
    });
    it('should bring back the previously removed component', () => {
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(2);
      helper.bitMap.expectToHaveId('comp1');
    });
  });
  describe('remove in one lane, recover in an empty lane', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(2);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.softRemoveOnLane('comp1');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-b');
    });
    // currently it threw version "0.0.0" of component onpp7beq-remote/comp1 was not found
    it('should show a descriptive error', () => {
      expect(() => helper.command.recover(`${helper.scopes.remote}/comp1`)).to.throw('unable to find the component');
    });
  });
  describe('recover diverged component before snapping', () => {
    let beforeDiverge: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagWithoutBuild();
      helper.command.export();
      beforeDiverge = helper.scopeHelper.cloneWorkspace();

      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();

      helper.scopeHelper.getClonedWorkspace(beforeDiverge);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.import();

      helper.command.deleteComponent('comp1');
    });
    it('should not throw', () => {
      expect(() => helper.command.recover('comp1')).not.to.throw();
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(1);
    });
  });
});
