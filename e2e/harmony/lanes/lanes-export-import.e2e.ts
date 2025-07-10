import chai, { expect } from 'chai';
import { AUTO_SNAPPED_MSG } from '@teambit/legacy.constants';
import { Helper, fixtures } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('lanes export import', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('exporting a lane to a different scope than the component scope', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      const { scopePath, scopeName } = helper.scopeHelper.getNewBareScope();
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.command.createLane('dev');
      helper.command.changeLaneScope(scopeName);
      helper.fs.outputFile('comp1/comp1.spec.js');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
    });
    it('bit import in a new workspace should not throw an error', () => {
      expect(() => helper.command.importComponent('comp1')).not.to.throw();
    });
  });
  describe('branching out when a component is checked out to an older version', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagWithoutBuild();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      helper.command.tagWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo@0.0.1');

      helper.command.createLane();
      helper.fs.outputFile(`${helper.scopes.remote}/bar/foo/foo.js`, fixtures.fooFixtureV3);
      helper.command.snapAllComponentsWithoutBuild();

      helper.command.switchLocalLane('main');
    });
    it('should checkout to the head of the origin branch', () => {
      helper.bitMap.expectToHaveId('bar/foo', '0.0.2');
    });
    it('bit status should be clean', () => {
      helper.command.expectStatusToBeClean();
    });
  });
  // this makes sure that when exporting lanes, it only exports the local snaps.
  // in this test, the second snap is done on a clean scope without the objects of the first snap.
  describe('snap on lane, export, clear project, snap and export', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope({ disablePreview: false });
      // Do not add "disablePreview()" here. It's important to generate the preview here.
      // this is the file that exists on the first snap but not on the second.
      helper.command.createLane();
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponents();
      helper.command.exportLane();
      helper.git.mimicGitCloneLocalProjectHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.command.import();
      helper.fixtures.populateComponents(1, undefined, ' v2');
      helper.workspaceJsonc.disablePreview();
      helper.command.snapAllComponents();
    });
    it('should export with no errors about missing artifact files from the first snap', () => {
      expect(() => helper.command.export()).to.not.throw();
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
    describe('switching to a new lane', () => {
      before(() => {
        helper.command.createLane('stage');
      });
      it('should auto snap the component to the lane when switching to it', () => {
        const lane = helper.command.showOneLaneParsed('stage');
        expect(lane.components).to.have.lengthOf(3);
      });
    });
  });
});
