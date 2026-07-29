export type LaneSyncInput = {
  laneHead?: string;
  branchExists: boolean;
  lastSyncedHead?: string;
  hasDevCommits: boolean;
  conflictLabelPresent: boolean;
  /**
   * Has this branch **ever** been written by the reconciler — i.e. does a `Bit-Lane-Head` trailer exist
   * anywhere in its own history?
   *
   * This is the *positive evidence* that makes `close-pr` safe. Under the documented defaults
   * (`branchPrefix: ''`, `lanes: ['*']`) every branch name maps to a same-named lane, so an ordinary
   * developer branch that never had a lane is indistinguishable, on `laneHead`/`branchExists` alone, from
   * a lane branch whose lane was just deleted — and `close-pr` **deletes the branch**. Absence of a lane
   * is not evidence that the branch was ours; a trailer we wrote is.
   */
  wasLaneManaged: boolean;
};

export type LaneSyncAction =
  | { type: 'noop'; reason: string }
  | { type: 'import-lane' }
  | { type: 'export-branch' }
  | { type: 'merge-diverged' }
  | { type: 'close-pr' }
  | { type: 'halt'; reason: string };

export function planLaneSync(input: LaneSyncInput): LaneSyncAction {
  const { laneHead, branchExists, lastSyncedHead, hasDevCommits, conflictLabelPresent, wasLaneManaged } = input;
  if (conflictLabelPresent) {
    return { type: 'noop', reason: 'PR is labeled bit-sync-conflict; resolve and remove the label to resume' };
  }
  if (!laneHead) {
    if (!branchExists) return { type: 'noop', reason: 'lane and branch both absent' };
    // No lane, but the branch exists. `close-pr` deletes that branch, so it may only fire on *positive*
    // evidence that the reconciler created it: a `Bit-Lane-Head` trailer in its history. Without one this
    // is an ordinary branch that merely happens to match the lane mapping — someone's unmerged work, or a
    // default branch this run failed to recognize — and destroying it would be catastrophic and silent.
    if (!wasLaneManaged) {
      return { type: 'noop', reason: 'branch maps to no lane and has no sync history; ignoring' };
    }
    return { type: 'close-pr' };
  }
  if (!branchExists) return { type: 'import-lane' };
  if (!lastSyncedHead) {
    if (hasDevCommits) {
      return {
        type: 'halt',
        reason: 'branch has commits but no Bit-Lane-Head trailer; cannot tell which side is newer',
      };
    }
    return { type: 'import-lane' };
  }
  const laneMoved = laneHead !== lastSyncedHead;
  if (laneMoved && hasDevCommits) return { type: 'merge-diverged' };
  if (laneMoved) return { type: 'import-lane' };
  if (hasDevCommits) return { type: 'export-branch' };
  return { type: 'noop', reason: 'converged' };
}
