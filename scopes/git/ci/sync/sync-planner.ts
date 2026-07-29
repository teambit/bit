export type LaneSyncInput = {
  laneHead?: string;
  branchExists: boolean;
  lastSyncedHead?: string;
  hasDevCommits: boolean;
  conflictLabelPresent: boolean;
};

export type LaneSyncAction =
  | { type: 'noop'; reason: string }
  | { type: 'import-lane' }
  | { type: 'export-branch' }
  | { type: 'merge-diverged' }
  | { type: 'close-pr' }
  | { type: 'halt'; reason: string };

export function planLaneSync(input: LaneSyncInput): LaneSyncAction {
  const { laneHead, branchExists, lastSyncedHead, hasDevCommits, conflictLabelPresent } = input;
  if (conflictLabelPresent) {
    return { type: 'noop', reason: 'PR is labeled bit-sync-conflict; resolve and remove the label to resume' };
  }
  if (!laneHead) {
    return branchExists ? { type: 'close-pr' } : { type: 'noop', reason: 'lane and branch both absent' };
  }
  if (!branchExists) return { type: 'import-lane' };
  if (!lastSyncedHead) {
    if (hasDevCommits) {
      return { type: 'halt', reason: 'branch has commits but no Bit-Lane-Head trailer; cannot tell which side is newer' };
    }
    return { type: 'import-lane' };
  }
  const laneMoved = laneHead !== lastSyncedHead;
  if (laneMoved && hasDevCommits) return { type: 'merge-diverged' };
  if (laneMoved) return { type: 'import-lane' };
  if (hasDevCommits) return { type: 'export-branch' };
  return { type: 'noop', reason: 'converged' };
}
