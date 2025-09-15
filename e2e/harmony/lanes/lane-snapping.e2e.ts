import chai, { expect } from 'chai';
import { AUTO_SNAPPED_MSG } from '@teambit/legacy.constants';
import { Helper, fixtures } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

describe('bit lane snapping and tagging', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('create a snap on main then on a new lane', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      helper.command.snapAllComponentsWithoutBuild();
    });
    it('bit status should show the component only once as staged', () => {
      const status = helper.command.statusJson();
      expect(status.stagedComponents).to.have.lengthOf(1);
      expect(status.importPendingComponents).to.have.lengthOf(0);
      expect(status.invalidComponents).to.have.lengthOf(0);
      expect(status.modifiedComponents).to.have.lengthOf(0);
      expect(status.newComponents).to.have.lengthOf(0);
      expect(status.outdatedComponents).to.have.lengthOf(0);
    });
    it('bit log should show both snaps', () => {
      const log = helper.command.log('bar/foo');
      const mainSnap = helper.command.getHead('bar/foo');
      const devSnap = helper.command.getHeadOfLane('dev', 'bar/foo');
      expect(log).to.have.string(mainSnap);
      expect(log).to.have.string(devSnap);
    });
    it('bit log --parents should show the parents', () => {
      const log = helper.command.log('bar/foo', '--parents');
      const mainSnap = helper.command.getHeadShort('bar/foo');
      expect(log).to.have.string(`Parent(s): ${mainSnap}`);
    });
  });

  describe('tagging on a lane', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.createLane();
      helper.command.snapAllComponents();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      output = helper.general.runWithTryCatch('bit tag bar/foo');
    });
    it('should block the tag and suggest to switch to main and merge the changes', () => {
      expect(output).to.have.string(
        'unable to tag when checked out to a lane, please switch to main, merge the lane and then tag again'
      );
    });
  });

  describe('auto-snap when on a lane', () => {
    let snapOutput;
    let comp3Head;
    let comp2Head;
    let comp1Head;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane();
      helper.fixtures.populateComponents();
      helper.command.snapAllComponents();

      helper.fs.outputFile('comp3/index.js', `module.exports = () => 'comp3 v2';`);

      const statusOutput = helper.command.runCmd('bit status');
      expect(statusOutput).to.have.string('components pending auto-tag (when their modified dependencies are tagged)');

      snapOutput = helper.command.snapComponent('comp3');
      comp3Head = helper.command.getHeadOfLane('dev', 'comp3');
      comp2Head = helper.command.getHeadOfLane('dev', 'comp2');
      comp1Head = helper.command.getHeadOfLane('dev', 'comp1');
    });
    it('should auto snap the dependencies and the nested dependencies', () => {
      expect(snapOutput).to.have.string(AUTO_SNAPPED_MSG);
    });
    it('should update the dependencies and the flattenedDependencies of the dependent with the new versions', () => {
      const isString = helper.command.catComponent(`comp2@${comp2Head}`);
      expect(isString.dependencies[0].id.name).to.equal('comp3');
      expect(isString.dependencies[0].id.version).to.equal(comp3Head);

      expect(isString.flattenedDependencies).to.deep.include({
        name: 'comp3',
        scope: helper.scopes.remote,
        version: comp3Head,
      });
    });
    it('should update the dependencies and the flattenedDependencies of the dependent of the dependent with the new versions', () => {
      const barFoo = helper.command.catComponent(`comp1@${comp1Head}`);
      expect(barFoo.dependencies[0].id.name).to.equal('comp2');
      expect(barFoo.dependencies[0].id.version).to.equal(comp2Head);

      expect(barFoo.flattenedDependencies).to.deep.include({
        name: 'comp3',
        scope: helper.scopes.remote,
        version: comp3Head,
      });
      expect(barFoo.flattenedDependencies).to.deep.include({
        name: 'comp2',
        scope: helper.scopes.remote,
        version: comp2Head,
      });
    });
    it('bit-status should show them all as staged and not modified', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponents).to.be.empty;
      const staged = helper.command.getStagedIdsFromStatus();
      expect(staged).to.include('comp1');
      expect(staged).to.include('comp2');
      expect(staged).to.include('comp3');
    });
  });

  describe('snapping and un-tagging on a lane', () => {
    let afterFirstSnap: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      afterFirstSnap = helper.scopeHelper.cloneWorkspace();
      helper.command.resetAll();
    });
    it('bit lane show should not show the component as belong to the lane anymore', () => {
      const lane = helper.command.showOneLaneParsed('dev');
      expect(lane.components).to.have.lengthOf(0);
    });
    // a previous bug kept the WorkspaceLane object as is with the previous, untagged version
    it('bit list should not show the currentVersion as the untagged version', () => {
      const list = helper.command.listParsed();
      expect(list[0].currentVersion).to.equal('N/A');
    });
    describe('switching to main', () => {
      before(() => {
        helper.command.switchLocalLane('main');
      });
      it('bit status should show the component as new', () => {
        const status = helper.command.statusJson();
        expect(status.newComponents).to.have.lengthOf(1);
      });
    });
    describe('add another snap and then untag only the last snap', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(afterFirstSnap);
        helper.command.snapComponentWithoutBuild('comp1', '--unmodified');
        helper.command.reset('comp1', true);
      });
      it('should not show the component as new', () => {
        const status = helper.command.statusJson();
        expect(status.newComponents).to.have.lengthOf(0);
        expect(status.stagedComponents).to.have.lengthOf(1);
      });
    });
    describe('un-snap by specifying the component name', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(afterFirstSnap);
      });
      // a previous bug was showing "unable to untag comp1, the component is not staged" error.
      it('should not throw an error', () => {
        expect(() => helper.command.reset('comp1')).to.not.throw();
      });
    });
  });

  describe('untag on a lane', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.command.createLane();
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
      output = helper.command.resetAll();
    });
    it('should untag successfully', () => {
      expect(output).to.have.string('1 component(s) were reset');
    });
    it('should change the component to be new', () => {
      const status = helper.command.statusJson();
      expect(status.newComponents).to.have.lengthOf(1);
    });
  });

  describe('bit checkout to a previous snap', () => {
    let firstSnap: string;
    let secondSnap: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      firstSnap = helper.command.getHeadOfLane('dev', 'comp1');
      helper.fixtures.populateComponents(1, undefined, 'v2');
      helper.command.snapComponentWithoutBuild('comp1');
      secondSnap = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.checkoutVersion(firstSnap, 'comp1');
    });
    it('should not show the component as modified', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponents).to.have.lengthOf(0);
    });
    it('bit list should show the scope-version as latest and workspace-version as the checked out one', () => {
      const list = helper.command.listParsed();
      const comp1 = list[0];
      expect(comp1.currentVersion).to.equal(firstSnap);
      expect(comp1.localVersion).to.equal(secondSnap);
    });
  });
});
