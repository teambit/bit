import { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

// the mirror image of "merge unrelated between two lanes with --resolve-unrelated" in
// merge-lanes-unrelated.e2e.ts: because the component is soft-removed on the current lane, the
// defaults flip - the strategy becomes "theirs" instead of "ours", and the parents are taken from
// the other lane instead of the current one.
describe('current lane a comp is removed, merging a lane that has this comp with different history', function () {
  this.timeout(0);
  let helper: Helper;
  let headOnLaneA: string;
  let headOnLaneB: string;
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setWorkspaceWithRemoteScope();
    helper.command.createLane('lane-a');
    helper.fixtures.populateComponents(1, false, 'lane-a');
    helper.command.snapAllComponentsWithoutBuild();
    helper.command.export();
    headOnLaneA = helper.command.getHeadOfLane('lane-a', 'comp1');

    helper.scopeHelper.reInitWorkspace();
    helper.scopeHelper.addRemoteScope();
    helper.command.createLane('lane-b');
    helper.fixtures.populateComponents(1, false, 'lane-b');
    helper.command.snapAllComponentsWithoutBuild();
    helper.command.export();

    helper.command.softRemoveOnLane('comp1');
    helper.command.snapAllComponentsWithoutBuild();
    helper.command.export();
    headOnLaneB = helper.command.getHeadOfLane('lane-b', 'comp1');

    helper.command.mergeLane('lane-a', '--resolve-unrelated -x');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  // should default to resolve by "their" because the current is removed
  it('should get the file content according to their', () => {
    const fileContent = helper.fs.readFile(`${helper.scopes.remote}/comp1/index.js`);
    expect(fileContent).to.have.string('lane-a');
    expect(fileContent).to.not.have.string('lane-b');
  });
  // both the unrelated ref and the parents come off the same Version object, so they are asserted
  // together rather than paying for a second cat-component
  it('should populate the unrelated property from the current head and the parents from the other lane', () => {
    const ver = helper.command.catComponent('comp1@latest');
    expect(ver.unrelated.head).to.equal(headOnLaneB);
    expect(ver.unrelated.laneId.name).to.equal('lane-b');
    expect(ver.parents[0]).to.equal(headOnLaneA);
  });
});
