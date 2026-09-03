import chai, { expect } from 'chai';
import path from 'path';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

describe('lane-b was forked from lane-a and they are now diverged', function () {
  this.timeout(0);
  let helper: Helper;
  let headOnLaneA: string;
  let headOnLaneB: string;
  let fileAddedOnLaneA: string;
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setWorkspaceWithRemoteScope();
    helper.command.createLane('lane-a');
    helper.fixtures.populateComponents(1, false);
    helper.command.snapAllComponentsWithoutBuild();
    helper.command.export();
    helper.command.createLane('lane-b');
    helper.command.snapAllComponentsWithoutBuild('--unmodified');
    helper.command.export();
    helper.command.switchLocalLane('lane-a');
    // diverge with a real file change (a brand new file), so the merge below has to write a file
    // that exists in no version of lane-b
    fileAddedOnLaneA = path.join(helper.scopes.localPath, 'comp1/new-file.ts');
    helper.fs.outputFile('comp1/new-file.ts');
    helper.command.snapAllComponentsWithoutBuild();
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
  // asserted before the merge below, so the post-merge assertion cannot pass on a leftover file
  it('the file added on lane-a should not be on the filesystem while on lane-b', () => {
    expect(fileAddedOnLaneA).to.not.be.a.path();
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
    it('should write the file that was newly added on lane-a', () => {
      expect(fileAddedOnLaneA).to.be.a.file();
    });
  });
});
