import { expect } from 'chai';
import type { LaneOwnershipEvidence, LaneSyncAction, LaneSyncInput } from './sync-planner';
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
const laneGone = (ownership: LaneOwnershipEvidence) => ({ laneHead: undefined, ownership });

/**
 * The decision table. `action` (exact) is required on every row that decides a branch deletion: under
 * the defaults an ordinary developer branch reaches the planner in the same shape as a deleted lane's
 * branch, so `deleteBranch` and the keep reason are part of the contract, not incidental output.
 */
const table: Array<{
  name: string;
  input: Partial<LaneSyncInput>;
  type: LaneSyncAction['type'];
  action?: LaneSyncAction;
  reason?: string;
}> = [
  { name: 'converged -> noop', input: {}, type: 'noop', reason: 'converged' },
  {
    name: 'conflict label present -> noop until resolved',
    input: { laneHead: 'L2', conflictLabelPresent: true },
    type: 'noop',
  },
  { name: 'lane gone + no branch -> noop', input: { laneHead: undefined, branchExists: false }, type: 'noop' },

  {
    name: "own-live, no dev commits, OUR tip (the branch is exactly the lane's mirror) -> close-pr AND delete",
    input: laneGone('own-live'),
    type: 'close-pr',
    action: { type: 'close-pr', deleteBranch: true },
  },
  {
    // A developer who commits their own `.bitmap` write looks own-live with nothing above the state
    // commit; the marker is what separates our mirror from their branch.
    name: 'own-live, no dev commits, a tip WE DID NOT WRITE -> close-pr but KEEP the branch',
    input: { ...laneGone('own-live'), tipIsSyncCommit: false },
    type: 'close-pr',
    action: { type: 'close-pr', deleteBranch: false, keepReason: 'tip-not-a-sync-commit' },
  },
  {
    name: 'own-live WITH dev commits (never-exported work above the state commit) -> KEEP the branch',
    input: { ...laneGone('own-live'), hasDevCommits: true },
    type: 'close-pr',
    action: { type: 'close-pr', deleteBranch: false, keepReason: 'unmerged-commits' },
  },
  {
    // "tip-not-a-sync-commit" would send the reader after the wrong thing when there is real work.
    name: 'own-live with dev commits AND a foreign tip -> keeps, naming the commits as the reason',
    input: { ...laneGone('own-live'), hasDevCommits: true, tipIsSyncCommit: false },
    type: 'close-pr',
    action: { type: 'close-pr', deleteBranch: false, keepReason: 'unmerged-commits' },
  },
  {
    // Adoption proved content matched, never that the branch's pre-existing history is disposable.
    name: 'own-live, no dev commits, OUR tip, but it is the adoption ledger commit -> KEEP, never delete',
    input: { ...laneGone('own-live'), hasIndependentHistory: true },
    type: 'close-pr',
    action: { type: 'close-pr', deleteBranch: false, keepReason: 'adopted-branch' },
  },
  {
    name: 'own-merged (branch tip already in the default branch) -> close-pr AND delete',
    input: laneGone('own-merged'),
    type: 'close-pr',
    action: { type: 'close-pr', deleteBranch: true },
  },
  {
    // Reachability alone proves deleting loses nothing, so no marker conjunction applies here.
    name: 'own-merged deletes even with a foreign tip and dev commits',
    input: { ...laneGone('own-merged'), tipIsSyncCommit: false, hasDevCommits: true },
    type: 'close-pr',
    action: { type: 'close-pr', deleteBranch: true },
  },
  {
    name: 'own-merged deletes even when the tip is the adoption ledger commit — reachability is enough',
    input: { ...laneGone('own-merged'), hasIndependentHistory: true },
    type: 'close-pr',
    action: { type: 'close-pr', deleteBranch: true },
  },
  {
    name: 'own-superseded (PR merged, then more commits pushed) -> close-pr but KEEP the branch',
    input: laneGone('own-superseded'),
    type: 'close-pr',
    action: { type: 'close-pr', deleteBranch: false, keepReason: 'unmerged-commits' },
  },
  {
    name: 'inherited-or-none -> noop, and never close-pr',
    input: laneGone('inherited-or-none'),
    type: 'noop',
    reason: 'maps to no lane and has no sync history',
  },
  {
    name: 'inherited-or-none with the branch carrying its own dev commits -> still noop',
    input: { ...laneGone('inherited-or-none'), lastSyncedHead: undefined, hasDevCommits: true },
    type: 'noop',
  },

  // The adopt paths need no claim: nothing on them can delete a branch.
  {
    name: 'no branch yet -> import-lane',
    input: { branchExists: false, lastSyncedHead: undefined, ownership: 'inherited-or-none' },
    type: 'import-lane',
  },
  { name: 'lane moved, branch untouched -> import-lane', input: { laneHead: 'L2' }, type: 'import-lane' },
  { name: 'dev commits, lane unchanged -> export-branch', input: { hasDevCommits: true }, type: 'export-branch' },
  { name: 'both moved -> merge-diverged', input: { laneHead: 'L2', hasDevCommits: true }, type: 'merge-diverged' },
  {
    // Suspected work only — git cannot tell whether the bundled sources are inside the recorded snap,
    // so the executor probes with a read-only status check and settles without writing when clean.
    name: 'sources bundled into the state commit, otherwise converged -> export-branch (a probe)',
    input: { stateCommitBundlesSources: true, tipIsSyncCommit: false },
    type: 'export-branch',
    action: { type: 'export-branch' },
  },
  {
    name: 'bundled sources count as work when the lane also moved -> merge-diverged',
    input: { laneHead: 'L2', stateCommitBundlesSources: true, tipIsSyncCommit: false },
    type: 'merge-diverged',
  },
  {
    name: 'own-live with bundled sources -> KEEP the branch, naming the commits',
    input: { ...laneGone('own-live'), stateCommitBundlesSources: true, tipIsSyncCommit: false },
    type: 'close-pr',
    action: { type: 'close-pr', deleteBranch: false, keepReason: 'unmerged-commits' },
  },
  {
    // Our own ledger commits bundle sources too (import-lane writes the lane's files, merge-diverged
    // the merged tree) — already-exported content, not work. No probe can run against a deleted lane,
    // so the deletion path keeps consulting the tip marker, in the same direction it always has.
    name: 'own-live, bundled sources but the tip is OUR OWN ledger commit -> close-pr AND delete',
    input: { ...laneGone('own-live'), stateCommitBundlesSources: true, tipIsSyncCommit: true },
    type: 'close-pr',
    action: { type: 'close-pr', deleteBranch: true },
  },
  {
    // The convergence path is the opposite: a probe IS available there, and a tip that merely CLAIMS
    // to be ours (a squash body quoting the marker) must never suppress it — probe, don't trust.
    name: 'bundled sources with a tip claiming to be ours still probe -> export-branch',
    input: { stateCommitBundlesSources: true, tipIsSyncCommit: true },
    type: 'export-branch',
  },
  {
    // Adoption probes via `bit status`, so suspected bundled work routes there like dev commits do.
    name: 'existing branch, never synced, bundled sources -> adopt-branch (first contact)',
    input: { lastSyncedHead: undefined, ownership: 'inherited-or-none', stateCommitBundlesSources: true },
    type: 'adopt-branch',
  },
  {
    name: 'existing branch, never synced, no dev commits, lane EXISTS -> import-lane (adopt branch)',
    input: { lastSyncedHead: undefined, ownership: 'inherited-or-none' },
    type: 'import-lane',
  },
  {
    name: 'existing branch, never synced, has dev commits, lane EXISTS -> adopt-branch (first contact)',
    input: { lastSyncedHead: undefined, ownership: 'inherited-or-none', hasDevCommits: true },
    type: 'adopt-branch',
  },
  {
    name: 'existing branch, never synced, has dev commits, but .bitmap names a DIFFERENT lane -> halt',
    input: {
      lastSyncedHead: undefined,
      ownership: 'inherited-or-none',
      hasDevCommits: true,
      branchNamesDifferentLane: true,
    },
    type: 'halt',
    reason: 'names a different lane',
  },
  {
    // The executor resolves an inherited (merged) different-lane pointer to `false` — history, not a claim.
    name: 'existing branch, has dev commits, .bitmap names a MERGED-AND-INHERITED different lane -> adopt-branch',
    input: {
      lastSyncedHead: undefined,
      ownership: 'inherited-or-none',
      hasDevCommits: true,
      branchNamesDifferentLane: false,
    },
    type: 'adopt-branch',
  },
];

describe('planLaneSync', () => {
  table.forEach(({ name, input, type, action, reason }) => {
    it(name, () => {
      const result = planLaneSync({ ...base, ...input });
      expect(result.type, name).to.equal(type);
      if (action) expect(result).to.deep.equal(action);
      if (reason) expect((result as { reason?: string }).reason).to.contain(reason);
    });
  });
});
