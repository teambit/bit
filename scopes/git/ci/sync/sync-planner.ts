/**
 * How much of a claim this lane/branch pair has on `origin/<branch>` — the only thing that licenses
 * retiring it, because `close-pr` deletes the branch. Under the default config every branch name maps
 * to a same-named lane, and branches cut after a merged sync PR inherit its `.bitmap`, so "looks
 * bit-managed" is not enough. Evidence = attribution (the branch's `.bitmap` lane pointer) plus
 * reachability of the state commit / tip from the default branch:
 *
 * - `own-live` — names this lane; state commit not in the default branch (real, unmerged lane branch).
 * - `own-merged` — names this lane; branch tip already in the default branch (deleting loses nothing).
 * - `own-superseded` — state commit merged but tip not: close the PR, KEEP the branch.
 * - `inherited-or-none` — no pointer, another lane's, or unreadable: not ours, touch nothing.
 */
export type LaneOwnershipEvidence = 'own-live' | 'own-merged' | 'own-superseded' | 'inherited-or-none';

export type LaneSyncInput = {
  /** fingerprint of the lane's component heads on bit.cloud; undefined when the lane is gone */
  laneHead?: string;
  branchExists: boolean;
  /**
   * The lane-component fingerprint as the branch's committed `.bitmap` records it; undefined when the
   * branch holds no state for this lane. Equality with `laneHead` is the definition of converged.
   */
  lastSyncedHead?: string;
  /** whether the branch carries commits on top of the commit that last wrote its `.bitmap` */
  hasDevCommits: boolean;
  /**
   * Whether the reconciler itself wrote the tip commit. The one exception to "markers are annotations":
   * consulted only on the branch-deletion path, and only ever to WITHHOLD a deletion. Must be computed
   * with `isSyncAuthoredMessage`, not the loop guard's substring match.
   */
  tipIsSyncCommit: boolean;
  conflictLabelPresent: boolean;
  /** @see LaneOwnershipEvidence — consulted only on the "lane is gone" path. */
  ownership: LaneOwnershipEvidence;
};

/**
 * Why a `close-pr` is keeping the branch rather than deleting it. `tip-advanced-during-run` is the one
 * the planner never emits: it is discovered when the executor re-reads the branch just before deleting.
 */
export type BranchKeepReason = 'unmerged-commits' | 'tip-not-a-sync-commit' | 'tip-advanced-during-run';

export type LaneSyncAction =
  | { type: 'noop'; reason: string }
  | { type: 'import-lane' }
  | { type: 'export-branch' }
  | { type: 'merge-diverged' }
  // Two variants rather than an optional `keepReason` so the type enforces that a keep always says why.
  | { type: 'close-pr'; deleteBranch: true }
  | { type: 'close-pr'; deleteBranch: false; keepReason: BranchKeepReason }
  | { type: 'halt'; reason: string };

export function planLaneSync(input: LaneSyncInput): LaneSyncAction {
  const { laneHead, branchExists, lastSyncedHead, hasDevCommits, conflictLabelPresent, ownership } = input;
  const { tipIsSyncCommit } = input;
  if (conflictLabelPresent) {
    return { type: 'noop', reason: 'PR is labeled bit-sync-conflict; resolve and remove the label to resume' };
  }
  if (!laneHead) {
    if (!branchExists) return { type: 'noop', reason: 'lane and branch both absent' };
    switch (ownership) {
      case 'own-live':
        // DELETION NEEDS BOTH HALVES: `.bitmap` attribution alone is not enough — a developer who commits
        // their own `.bitmap` write (bit create / unexported snap / deps set) looks exactly like
        // "own-live, nothing above the state commit". The marker can only withhold a deletion, never
        // authorize one; a false keep is harmless, a false delete destroys the only copy of the work.
        if (!hasDevCommits && tipIsSyncCommit) return { type: 'close-pr', deleteBranch: true };
        return {
          type: 'close-pr',
          deleteBranch: false,
          keepReason: hasDevCommits ? 'unmerged-commits' : 'tip-not-a-sync-commit',
        };
      case 'own-merged':
        // No marker conjunction needed: the tip being an ancestor of the default branch is unforgeable
        // proof that deleting loses nothing.
        return { type: 'close-pr', deleteBranch: true };
      case 'own-superseded':
        // Those commits are in no other ref.
        return { type: 'close-pr', deleteBranch: false, keepReason: 'unmerged-commits' };
      default:
        return { type: 'noop', reason: 'branch maps to no lane and has no sync history of its own; ignoring' };
    }
  }
  if (!branchExists) return { type: 'import-lane' };
  if (!lastSyncedHead) {
    if (hasDevCommits) {
      return {
        type: 'halt',
        reason: 'branch has commits but its .bitmap records no state for this lane; cannot tell which side is newer',
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
