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
  /**
   * Whether that same tip commit is `adopt-branch`'s ledger commit (`ADOPTION_TRAILER`) rather than an
   * ordinary sync commit. Consulted only alongside `tipIsSyncCommit` with no dev commits (the tip IS
   * the state commit then) to withhold an immediate delete: adoption only ever proved the BRANCH's
   * content matched the lane's, never that the branch's own pre-existing history is disposable. A
   * merged/superseded claim (reachable from the default branch) is unaffected — only the unreachable,
   * "delete now" path is guarded.
   */
  tipIsAdoptionCommit?: boolean;
  conflictLabelPresent: boolean;
  /**
   * Whether the branch's committed `.bitmap` names a DIFFERENT lane than the one being reconciled.
   * Consulted only when `lastSyncedHead` is absent, to tell "no state at all" (safe to adopt) from
   * "already claimed by another lane" (never silently adopt).
   */
  branchNamesDifferentLane?: boolean;
  /** @see LaneOwnershipEvidence — consulted only on the "lane is gone" path. */
  ownership: LaneOwnershipEvidence;
};

/**
 * Why a `close-pr` is keeping the branch rather than deleting it. `tip-advanced-during-run` is the one
 * the planner never emits: it is discovered when the executor re-reads the branch just before deleting.
 */
export type BranchKeepReason =
  | 'unmerged-commits'
  | 'tip-not-a-sync-commit'
  | 'tip-advanced-during-run'
  | 'adopted-branch';

export type LaneSyncAction =
  | { type: 'noop'; reason: string }
  | { type: 'import-lane' }
  | { type: 'export-branch' }
  | { type: 'merge-diverged' }
  | { type: 'adopt-branch' }
  // Two variants rather than an optional `keepReason` so the type enforces that a keep always says why.
  | { type: 'close-pr'; deleteBranch: true }
  | { type: 'close-pr'; deleteBranch: false; keepReason: BranchKeepReason }
  | { type: 'halt'; reason: string };

export function planLaneSync(input: LaneSyncInput): LaneSyncAction {
  const { laneHead, branchExists, lastSyncedHead, hasDevCommits, conflictLabelPresent, ownership } = input;
  const { tipIsSyncCommit, tipIsAdoptionCommit, branchNamesDifferentLane } = input;
  if (conflictLabelPresent) {
    return { type: 'noop', reason: 'PR is labeled bit-sync-conflict; resolve and remove the label to resume' };
  }
  if (!laneHead) {
    if (!branchExists) return { type: 'noop', reason: 'lane and branch both absent' };
    switch (ownership) {
      case 'own-live':
        // DELETION NEEDS EVERY HALF — a cascade, each one a separate reason to withhold:
        // 1. dev commits on top: real work that exists nowhere else.
        // 2. the tip isn't our own commit: `.bitmap` attribution alone is not enough — a developer who
        //    commits their own `.bitmap` write (bit create / unexported snap / deps set) looks exactly
        //    like "own-live, nothing above the state commit".
        // 3. the tip IS our commit, but it's `adopt-branch`'s: adoption only proved the branch's
        //    content matched the lane's, never that its pre-existing (human-authored) history is
        //    disposable — a false keep is harmless, a false delete destroys the only copy of the work.
        // Only past all three does a same-content mirror license its own deletion.
        if (hasDevCommits) {
          return { type: 'close-pr', deleteBranch: false, keepReason: 'unmerged-commits' };
        }
        if (!tipIsSyncCommit) {
          return { type: 'close-pr', deleteBranch: false, keepReason: 'tip-not-a-sync-commit' };
        }
        if (tipIsAdoptionCommit) {
          return { type: 'close-pr', deleteBranch: false, keepReason: 'adopted-branch' };
        }
        return { type: 'close-pr', deleteBranch: true };
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
      // A branch that already names a DIFFERENT lane is never adopted here — that claim is someone
      // else's to resolve, not something this lane's sync run may silently absorb or overwrite.
      if (branchNamesDifferentLane) {
        return {
          type: 'halt',
          reason: 'branch has commits but its .bitmap names a different lane; cannot tell which side is newer',
        };
      }
      // No prior sync history for this lane/branch pair, and the branch has commits of its own — the
      // lane exists, so this is first contact, not a conflict. Adopt: converge the pair and let the
      // executor's ledger commit give the branch's `.bitmap` a lane pointer to read next time.
      return { type: 'adopt-branch' };
    }
    return { type: 'import-lane' };
  }
  const laneMoved = laneHead !== lastSyncedHead;
  if (laneMoved && hasDevCommits) return { type: 'merge-diverged' };
  if (laneMoved) return { type: 'import-lane' };
  if (hasDevCommits) return { type: 'export-branch' };
  return { type: 'noop', reason: 'converged' };
}
