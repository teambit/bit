import chai, { expect } from 'chai';
import Helper from '../../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('lane-b was forked from lane-a and they are now diverged', function () {
  this.timeout(0);
  let helper: Helper;
  let headOnLaneA: string;
  let headOnLaneB: string;
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setNewLocalAndRemoteScopes();
    helper.command.createLane('lane-a');
    helper.fixtures.populateComponents(1, false);
    helper.command.snapAllComponentsWithoutBuild();
    helper.command.export();
    helper.command.createLane('lane-b');
    helper.command.snapAllComponentsWithoutBuild('--unmodified');
    helper.command.export();
    helper.command.switchLocalLane('lane-a');
    helper.command.snapAllComponentsWithoutBuild('--unmodified');
    headOnLaneA = helper.command.getHeadOfLane('lane-a', 'comp1');
    helper.command.export();
    helper.command.switchLocalLane('lane-b');
    headOnLaneB = helper.command.getHeadOfLane('lane-b', 'comp1');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  it('bit status should have the diverged component in the updatesFromForked section', () => {
    const status = helper.command.statusJson(undefined, '--lanes');
    expect(status.updatesFromForked).to.have.lengthOf(1);
  });
  describe('merging lane-a into lane-b', () => {
    before(() => {
      helper.command.mergeLane('lane-a');
    });
    // similar to git, if you merge A into B, the first parent is B and the second is A.
    it('should snap the components and save the first parent from the current lane (lane-b) and the second parent from lane-a', () => {
      const newHead = helper.command.getHeadOfLane('lane-b', 'comp1');
      const cat = helper.command.catComponent(`${helper.scopes.remote}/comp1@${newHead}`);
      const parents = cat.parents;
      expect(parents).to.have.lengthOf(2);
      expect(parents[0]).to.equal(headOnLaneB);
      expect(parents[1]).to.equal(headOnLaneA);
    });
  });
});
