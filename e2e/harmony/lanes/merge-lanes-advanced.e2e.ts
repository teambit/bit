import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import { specFileFailingFixture } from '../jest.e2e';

chai.use(require('chai-fs'));

describe('merge lanes advanced', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('merge with --detach-head', () => {
    let beforeMerge: string;
    let headAfterMerge: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.populateComponents(1, undefined, 'version2');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.switchLocalLane('main');
      helper.fixtures.populateComponents(1, undefined, 'version3');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      beforeMerge = helper.scopeHelper.cloneWorkspace();

      helper.command.switchLocalLane('dev');
      helper.command.mergeLane('main', '--detach-head -x');
      headAfterMerge = helper.command.getHeadOfLane('dev', 'comp1');
    });
    it('should not change the head', () => {
      const currentHead = helper.command.getHeadOfLane('dev', 'comp1');
      expect(currentHead).to.not.equal(headAfterMerge);
    });
    it('should save the detached head', () => {
      const lane = helper.command.showOneLaneParsed('dev');
      expect(lane.components[0].head).to.not.equal(headAfterMerge);
    });
    it('should continue the history from the common snap, not from the head', () => {
      const log = helper.command.logParsed('comp1');
      expect(log[0].hash).to.equal(headAfterMerge);
      expect(log[0].parents).to.have.lengthOf(2);
    });
    it('should squash successfully', () => {
      helper.scopeHelper.getClonedWorkspace(beforeMerge);
      helper.command.switchLocalLane('dev');
      expect(() => helper.command.mergeLane('main', '--detach-head --squash -x')).to.not.throw();
    });
  });
  describe('merge with --build --loose', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.workspaceJsonc.setupDefault();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1, false);
      helper.fs.outputFile('comp1/comp1.spec.ts', specFileFailingFixture);
      helper.command.install();
      helper.command.compile();
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.populateComponents(1, false, 'v2');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.switchLocalLane('main');
    });
    describe('without --loose flag', () => {
      it('should fail when merging with --build due to test failures', () => {
        const merge = () => helper.command.mergeLane('dev', '--build');
        expect(merge).to.throw();
      });
    });
    describe('with --loose flag', () => {
      before(() => {
        helper.command.mergeLane('dev', '--build --loose');
      });
      it('should succeed despite test failures', () => {
        helper.command.expectStatusToBeClean();
      });
      it('should indicate that the test failed', () => {
        const list = helper.command.listParsed();
        expect(list[0].issues.length).to.be.greaterThan(0);
      });
    });
  });
  describe('--no-snap vs --no-auto-snap', () => {
    let beforeMergeOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.populateComponents(1, undefined, 'version2');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.switchLocalLane('main');
      helper.fixtures.populateComponents(1, undefined, 'version3');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      beforeMergeOutput = helper.scopeHelper.cloneWorkspace();

      helper.command.switchLocalLane('dev');
    });
    describe('with --no-auto-snap', () => {
      before(() => {
        helper.command.mergeLane('main', '--no-auto-snap -x');
      });
      it('should update current lane according to the merged one', () => {
        const lane = helper.command.showOneLaneParsed('dev');
        expect(lane.components).to.have.lengthOf(1);
      });
      it('should not leave the components as modified', () => {
        const status = helper.command.statusJson();
        expect(status.modifiedComponents).to.have.lengthOf(0);
      });
    });
    describe('with --no-snap', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(beforeMergeOutput);
        helper.command.switchLocalLane('dev');
        helper.command.mergeLane('main', '--no-snap -x');
      });
      it('should not update current lane according to the merged one', () => {
        const lane = helper.command.showOneLaneParsed('dev');
        expect(lane.components).to.have.lengthOf(1);
      });
      it('should leave the components as modified', () => {
        const status = helper.command.statusJson();
        expect(status.modifiedComponents).to.have.lengthOf(1);
      });
      describe('after snapping', () => {
        before(() => {
          helper.command.snapAllComponentsWithoutBuild();
        });
        it('should save two parents, from the current lane and from the merged lane', () => {
          const cat = helper.command.catComponent('comp1@latest');
          expect(cat.parents).to.have.lengthOf(2);
        });
      });
    });
  });
  describe('merging from lane with --no-snap when there is no base-snap', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane();
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
    });
    it('should not throw an error', () => {
      expect(() => helper.command.mergeLane('main', '--no-snap')).to.not.throw();
    });
  });
  describe('bit lane merge-move command', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.populateComponents(1, undefined, 'version2');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.switchLocalLane('main');
      helper.fixtures.populateComponents(1, undefined, 'version3');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.switchLocalLane('dev');
      helper.command.mergeMoveToNewLane('main', 'dev-merged');
    });
    it('should create a new lane', () => {
      const lanes = helper.command.listLanesParsed();
      const newLane = lanes.lanes.find((lane) => lane.name === 'dev-merged');
      expect(newLane).to.exist;
    });
    it('the new lane should have the new local snaps created on the original lane', () => {
      const newLane = helper.command.showOneLaneParsed('dev-merged');
      expect(newLane.components).to.have.lengthOf(1);
    });
    it('the new lane should have the same components as the original lane', () => {
      const originalLane = helper.command.showOneLaneParsed('dev');
      const newLane = helper.command.showOneLaneParsed('dev-merged');
      expect(originalLane.components[0].id).to.equal(newLane.components[0].id);
    });
    it('the filesystem should stay the same', () => {
      const comp1Content = helper.fs.readFile('comp1/index.js');
      expect(comp1Content).to.have.string('version2');
    });
    it('the original lane should be reverted to the before-merge state', () => {
      const originalLane = helper.command.showOneLaneParsed('dev');
      expect(originalLane.components).to.have.lengthOf(1);
    });
  });
});
