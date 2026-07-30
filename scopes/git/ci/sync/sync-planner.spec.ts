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

  /**
   * THE branch-destruction guard, one row per `LaneOwnershipEvidence`.
   *
   * Under the documented defaults (`branchPrefix: ''`, `lanes: ['*']`) every branch on `origin` maps to a
   * same-named lane, so an ordinary developer branch reaches the planner with exactly the shape of a lane
   * branch whose lane was deleted — and `close-pr` deletes the branch. What separates them is the claim on
   * the branch; nothing else in the input can stand in for it, which is why a bare
   * "does it carry a trailer" boolean was not enough (an inherited trailer satisfies it).
   */
  describe('lane deleted remotely, branch still present: the claim on the branch decides', () => {
    it("own-live with NO dev commits and OUR tip (the branch is exactly the lane's mirror) -> close-pr AND delete", () => {
      expect(planLaneSync(laneGone('own-live'))).to.deep.equal({ type: 'close-pr', deleteBranch: true });
    });

    /**
     * THE laundering guard, and the reason deletion needs both halves.
     *
     * A developer on a lane branch who runs `bit create`, an unexported `bit snap`, or `bit deps set` and
     * commits the result has written `.bitmap` themselves. Their commit becomes the state commit, so the tip
     * IS the state commit (`hasDevCommits: false`), and the lane pointer they inherited is still in the file
     * — every structural test says `own-live` with nothing above it. Deleting on that evidence destroys work
     * that was never exported anywhere. The marker is what separates "our mirror" from "a developer's branch
     * that happens to carry our pointer": it can only ever withhold a deletion, never authorize one.
     */
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
      // own-live means the sync PR was never merged, so commits above the state commit reached neither the
      // lane nor the default branch — they exist in no other ref, and deleting the branch would destroy
      // the only copy.
      expect(planLaneSync({ ...laneGone('own-live'), hasDevCommits: true })).to.deep.equal({
        type: 'close-pr',
        deleteBranch: false,
        keepReason: 'unmerged-commits',
      });
    });

    it('own-merged (branch tip already in the default branch) -> close-pr AND delete', () => {
      // The just-merged lane whose branch the git host did not auto-delete. Nothing on the branch is
      // missing from the default branch, so deleting it cannot lose work.
      expect(planLaneSync(laneGone('own-merged'))).to.deep.equal({ type: 'close-pr', deleteBranch: true });
    });

    it('own-merged deletes even when we did not write the tip — reachability already proves it is safe', () => {
      // The marker conjunction is NOT applied here, and that is deliberate rather than an oversight.
      // `own-merged` means the branch TIP is an ancestor of the default branch, so every commit on the
      // branch — whoever wrote it — is reachable from the default branch. That is an independent,
      // unforgeable proof that deleting loses nothing, which is exactly what the marker stands in for on the
      // `own-live` path where no such proof exists.
      expect(planLaneSync({ ...laneGone('own-merged'), tipIsSyncCommit: false, hasDevCommits: true })).to.deep.equal({
        type: 'close-pr',
        deleteBranch: true,
      });
    });

    it('own-superseded (PR merged, then more commits pushed) -> close-pr but KEEP the branch', () => {
      // Those commits are in no other ref. Data preservation beats tidiness.
      expect(planLaneSync(laneGone('own-superseded'))).to.deep.equal({
        type: 'close-pr',
        deleteBranch: false,
        keepReason: 'unmerged-commits',
      });
    });

    it('inherited-or-none -> noop, and never close-pr', () => {
      // An ordinary developer branch: either no sync commit on its own line, or one naming a *different*
      // lane because it was inherited from the default branch when some sync PR was squash/rebase/ff-merged.
      // This is the shape the reviewer reproduced as a silent `git push origin --delete` of
      // `origin/feature-x`.
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

  /**
   * The adopt case is unaffected by `ownership`: it requires `laneHead` to be defined, so the lane exists
   * and the pairing is established by the branch mapping rather than by history. Nothing on these paths can
   * delete a branch, which is why they need no claim.
   */
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
