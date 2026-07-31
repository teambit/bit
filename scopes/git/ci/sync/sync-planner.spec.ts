import { expect } from 'chai';
import type { LaneOwnershipEvidence, LaneSyncInput } from './sync-planner';
import { planLaneSync } from './sync-planner';

const base: LaneSyncInput = {
  laneHead: 'L1',
  branchExists: true,
  lastSyncedHead: 'L1',
  hasDevCommits: false,
  tipIsSyncCommit: true,
  conflictLabelPresent: false,
  ownership: 'own-live',
};

/** the "lane deleted remotely, branch still there" shape — the only path that reads `ownership` */
const laneGone = (ownership: LaneOwnershipEvidence): LaneSyncInput => ({
  ...base,
  laneHead: undefined,
  ownership,
});

describe('planLaneSync', () => {
  it('converged -> noop', () => {
    expect(planLaneSync({ ...base }).type).to.equal('noop');
  });
  it('conflict label present -> noop until resolved', () => {
    expect(planLaneSync({ ...base, laneHead: 'L2', conflictLabelPresent: true }).type).to.equal('noop');
  });
  it('lane gone + no branch -> noop', () => {
    expect(planLaneSync({ ...base, laneHead: undefined, branchExists: false }).type).to.equal('noop');
  });

  // The branch-destruction guard, one row per `LaneOwnershipEvidence`: under the defaults an ordinary
  // developer branch reaches the planner with the same shape as a deleted lane's branch.
  describe('lane deleted remotely, branch still present: the claim on the branch decides', () => {
    it("own-live with NO dev commits and OUR tip (the branch is exactly the lane's mirror) -> close-pr AND delete", () => {
      expect(planLaneSync(laneGone('own-live'))).to.deep.equal({ type: 'close-pr', deleteBranch: true });
    });

    // A developer who commits their own `.bitmap` write looks own-live with nothing above the state
    // commit; the marker is what separates our mirror from their branch.
    it('own-live with NO dev commits but a tip WE DID NOT WRITE -> close-pr but KEEP the branch', () => {
      expect(planLaneSync({ ...laneGone('own-live'), tipIsSyncCommit: false })).to.deep.equal({
        type: 'close-pr',
        deleteBranch: false,
        keepReason: 'tip-not-a-sync-commit',
      });
    });

    it('names the keep reason, because "unmerged commits" would send the reader after the wrong thing', () => {
      const withWork = planLaneSync({ ...laneGone('own-live'), hasDevCommits: true, tipIsSyncCommit: false });
      expect(withWork.type === 'close-pr' && !withWork.deleteBranch && withWork.keepReason).to.equal(
        'unmerged-commits'
      );
    });

    it('own-live WITH dev commits (never-exported work above the state commit) -> close-pr but KEEP the branch', () => {
      expect(planLaneSync({ ...laneGone('own-live'), hasDevCommits: true })).to.deep.equal({
        type: 'close-pr',
        deleteBranch: false,
        keepReason: 'unmerged-commits',
      });
    });

    it('own-merged (branch tip already in the default branch) -> close-pr AND delete', () => {
      expect(planLaneSync(laneGone('own-merged'))).to.deep.equal({ type: 'close-pr', deleteBranch: true });
    });

    it('own-merged deletes even when we did not write the tip — reachability already proves it is safe', () => {
      expect(planLaneSync({ ...laneGone('own-merged'), tipIsSyncCommit: false, hasDevCommits: true })).to.deep.equal({
        type: 'close-pr',
        deleteBranch: true,
      });
    });

    it('own-superseded (PR merged, then more commits pushed) -> close-pr but KEEP the branch', () => {
      expect(planLaneSync(laneGone('own-superseded'))).to.deep.equal({
        type: 'close-pr',
        deleteBranch: false,
        keepReason: 'unmerged-commits',
      });
    });

    it('inherited-or-none -> noop, and never close-pr', () => {
      const action = planLaneSync(laneGone('inherited-or-none'));
      expect(action.type).to.equal('noop');
      expect(action.type === 'noop' && action.reason).to.contain('maps to no lane and has no sync history');
    });

    it('inherited-or-none with the branch carrying its own dev commits -> still noop', () => {
      const action = planLaneSync({
        ...laneGone('inherited-or-none'),
        lastSyncedHead: undefined,
        hasDevCommits: true,
      });
      expect(action.type).to.equal('noop');
    });
  });

  it('no branch yet -> import-lane', () => {
    expect(
      planLaneSync({ ...base, branchExists: false, lastSyncedHead: undefined, ownership: 'inherited-or-none' }).type
    ).to.equal('import-lane');
  });
  it('lane moved, branch untouched -> import-lane', () => {
    expect(planLaneSync({ ...base, laneHead: 'L2' }).type).to.equal('import-lane');
  });
  it('dev commits, lane unchanged -> export-branch', () => {
    expect(planLaneSync({ ...base, hasDevCommits: true }).type).to.equal('export-branch');
  });
  it('both moved -> merge-diverged', () => {
    expect(planLaneSync({ ...base, laneHead: 'L2', hasDevCommits: true }).type).to.equal('merge-diverged');
  });

  // The adopt paths need no claim: nothing on them can delete a branch.
  it('existing branch, never synced, no dev commits, lane EXISTS -> import-lane (adopt branch)', () => {
    expect(planLaneSync({ ...base, lastSyncedHead: undefined, ownership: 'inherited-or-none' }).type).to.equal(
      'import-lane'
    );
  });
  it('existing branch, never synced, has dev commits, lane EXISTS -> halt (ambiguous)', () => {
    const action = planLaneSync({
      ...base,
      lastSyncedHead: undefined,
      ownership: 'inherited-or-none',
      hasDevCommits: true,
    });
    expect(action.type).to.equal('halt');
  });
});
