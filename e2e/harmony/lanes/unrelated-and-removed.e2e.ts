import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('current lane a comp is removed, merging a lane that has this comp with different history', function () {
  this.timeout(0);
  let helper: Helper;
  let headOnLaneA: string;
  let headOnLaneB: string;
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setNewLocalAndRemoteScopes();
    helper.command.createLane('lane-a');
    helper.fixtures.populateComponents(1, false, 'lane-a');
    helper.command.snapAllComponentsWithoutBuild();
    helper.command.export();
    headOnLaneA = helper.command.getHeadOfLane('lane-a', 'comp1');

    helper.scopeHelper.reInitLocalScope();
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
  it('should populate the unrelated property according to the current head', () => {
    const ver = helper.command.catComponent('comp1@latest');
    expect(ver.unrelated.head).to.equal(headOnLaneB);
    expect(ver.unrelated.laneId.name).to.equal('lane-b');
  });
  it('should populate the parents according to the other lane', () => {
    const ver = helper.command.catComponent('comp1@latest');
    expect(ver.parents[0]).to.equal(headOnLaneA);
  });
});
