import chai, { expect } from 'chai';
import Helper from '../../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('local is diverged from the remote', function () {
  this.timeout(0);
  let helper: Helper;
  let beforeDiverge: string;
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setNewLocalAndRemoteScopes();
    helper.command.createLane();
    helper.fixtures.populateComponents(1, false);
    helper.command.snapAllComponentsWithoutBuild();
    helper.command.export();
    beforeDiverge = helper.scopeHelper.cloneLocalScope();
    helper.command.snapAllComponentsWithoutBuild('--unmodified');
    helper.command.export();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('snap first then import', () => {
    before(() => {
      helper.scopeHelper.getClonedLocalScope(beforeDiverge);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.import();
    });
    it('bit status should show it as merge-pending', () => {
      const status = helper.command.statusJson();
      expect(status.mergePendingComponents).to.have.lengthOf(1);
    });
    it('bit reset should not throw', () => {
      expect(() => helper.command.untagAll()).to.not.throw();
    });
  });
  describe('import first then snap', () => {
    let currentSnap: string;
    before(() => {
      helper.scopeHelper.getClonedLocalScope(beforeDiverge);
      currentSnap = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.import();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
    });
    // previous bug was using the head on the lane as the parent.
    it('parent of the snap should be the previous local snap, not the remote snap', () => {
      const cmp = helper.command.catComponent('comp1@latest');
      const parent = cmp.parents[0];
      expect(parent).to.equal(currentSnap);
      const remoteSnap = helper.general.getRemoteHead('comp1', 'dev');
      expect(parent).to.not.equal(remoteSnap);
    });
    it('bit status should show it as merge-pending', () => {
      const status = helper.command.statusJson();
      expect(status.mergePendingComponents).to.have.lengthOf(1);
    });
  });
});

// lane-b was forked from lane-a. locally, lane-b has snapA + snapB + snapX1 + snapX2.
// remotely, lane-b has snapA + snapB + snapY
// on the same remote, lane-a has snapA + snapX1. (this happens if lane-a was merged into lane-b locally)
// because on the same remote, the snapX1 exists, we used to stop the traversal assuming that the local is ahead.
// which is incorrect, because from lane-b perspective, they are diverged.
describe('local is diverged from the remote and another lane has a more recent snap', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setNewLocalAndRemoteScopes();
    helper.command.createLane('lane-a');
    helper.fixtures.populateComponents(1, false);
    helper.command.snapAllComponentsWithoutBuild(); // snapA
    helper.command.export();
    helper.command.createLane('lane-b');
    helper.command.snapAllComponentsWithoutBuild('--unmodified'); // snapB
    helper.command.export();
    const laneAFirstSnap = helper.scopeHelper.cloneLocalScope();
    helper.command.snapAllComponentsWithoutBuild('--unmodified'); // snapY
    helper.command.export();
    helper.command.switchLocalLane('lane-a');
    helper.command.snapAllComponentsWithoutBuild('--unmodified'); // snapX1
    helper.command.export();

    // locally
    helper.scopeHelper.getClonedLocalScope(laneAFirstSnap);
    helper.command.mergeLane('lane-a'); // now lane-b has snapA + snapB + snapX1 (from lane-a) + snapX2 (the snap-merge)
    helper.command.import();
    // keep this to fetch from all lanes, because in the future, by default, only the current lane is fetched
    helper.command.fetchAllLanes();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  it('bit status should show it as merge-pending', () => {
    const status = helper.command.statusJson();
    expect(status.mergePendingComponents).to.have.lengthOf(1);
  });
});
