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
   * Whether the state commit also touched non-`.bitmap` files — SUSPECTED work git cannot confirm (the
   * files may already be inside the recorded snap). Content-only, so this reconciler's own
   * source-bundling ledger commits read `true` too. Plans the probing `export-branch` when everything
   * else reads converged; treated like dev commits everywhere a wrong "no work" answer could lose
   * something (deletion, divergence, first contact).
   */
  stateCommitBundlesSources?: boolean;
  /**
   * Whether the reconciler itself wrote the tip commit. The one exception to "markers are annotations":
   * consulted only on the branch-deletion path — to withhold a deletion, and to discount bundled
   * sources our own ledger commit carries (no probe can run against a deleted lane). It must never
   * decide convergence: a squash body quoting the marker forges it. Must be computed with
   * `isSyncAuthoredMessage`, not the loop guard's substring match.
   */
  tipIsSyncCommit: boolean;
  /**
   * The branch had real (non-bit) commits before this reconciler touched it — it was adopted, not
   * manufactured. Can only withhold a delete, never authorize one.
   */
  hasIndependentHistory?: boolean;
  conflictLabelPresent: boolean;
  /** The branch's committed `.bitmap` names a DIFFERENT lane — another lane's claim, never adopted. */
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
  // May be a probe: the executor asks `bit status` (a read) whether the branch's tree holds anything
  // the lane is missing, and a clean answer settles as converged without writing or pushing a thing —
  // which is why planning it on mere suspicion, run after run, is harmless.
  | { type: 'export-branch' }
  | { type: 'merge-diverged' }
  | { type: 'adopt-branch' }
  // Two variants rather than an optional `keepReason` so the type enforces that a keep always says why.
  | { type: 'close-pr'; deleteBranch: true }
  | { type: 'close-pr'; deleteBranch: false; keepReason: BranchKeepReason }
  | { type: 'halt'; reason: string };

export function planLaneSync(input: LaneSyncInput): LaneSyncAction {
  const { laneHead, branchExists, lastSyncedHead, hasDevCommits, conflictLabelPresent, ownership } = input;
  const { tipIsSyncCommit, hasIndependentHistory, branchNamesDifferentLane, stateCommitBundlesSources } = input;
  // Suspected-or-real work: everywhere a wrong "no work" answer could lose something, bundled sources
  // count like dev commits — the executor's read-only probe is what tells them apart.
  const mayCarryWork = hasDevCommits || Boolean(stateCommitBundlesSources);
  // The deletion path cannot probe (the lane is gone), so there — and only there — the tip marker
  // discounts the sources our own ledger commits bundle (import-lane writes the lane's files,
  // merge-diverged the merged tree). Same message dependence, same direction, as it always had.
  const mayCarryWorkForDeletion = hasDevCommits || (Boolean(stateCommitBundlesSources) && !tipIsSyncCommit);
  if (conflictLabelPresent) {
    return { type: 'noop', reason: 'PR is labeled bit-sync-conflict; resolve and remove the label to resume' };
  }
  if (!laneHead) {
    if (!branchExists) return { type: 'noop', reason: 'lane and branch both absent' };
    switch (ownership) {
      case 'own-live':
        // Each check is a separate reason to withhold a delete: real or suspected work exists nowhere
        // else; a non-sync tip may be a developer's own `.bitmap` write; an adopted branch's
        // pre-existing history was never proven disposable. A false keep is harmless, a false delete
        // destroys the only copy.
        if (mayCarryWorkForDeletion) {
          return { type: 'close-pr', deleteBranch: false, keepReason: 'unmerged-commits' };
        }
        if (!tipIsSyncCommit) {
          return { type: 'close-pr', deleteBranch: false, keepReason: 'tip-not-a-sync-commit' };
        }
        if (hasIndependentHistory) {
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
    if (mayCarryWork) {
      if (branchNamesDifferentLane) {
        return {
          type: 'halt',
          reason: 'branch has commits but its .bitmap names a different lane; cannot tell which side is newer',
        };
      }
      // The lane exists but the pair has no sync history: first contact, not a conflict — and
      // adoption already probes via `bit status`, so bundled sources are safe to route here too.
      return { type: 'adopt-branch' };
    }
    return { type: 'import-lane' };
  }
  const laneMoved = laneHead !== lastSyncedHead;
  if (laneMoved && mayCarryWork) return { type: 'merge-diverged' };
  if (laneMoved) return { type: 'import-lane' };
  if (mayCarryWork) return { type: 'export-branch' };
  return { type: 'noop', reason: 'converged' };
}
