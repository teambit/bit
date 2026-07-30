/**
 * How much of a claim *this* lane/branch pair has on `origin/<branch>` — the only thing that licenses
 * retiring it, because `close-pr` **deletes the branch**.
 *
 * The problem this exists to solve: under the documented defaults (`branchPrefix: ''`, `lanes: ['*']`)
 * every branch name maps to a same-named lane, so an ordinary developer branch with no lane reaches the
 * planner with exactly the same `laneHead`/`branchExists` shape as a lane branch whose lane was just
 * deleted. "Does the branch look bit-managed" is *not* enough to tell them apart either: once a sync PR is
 * squash-, rebase- or fast-forward-merged, the `.bitmap` it wrote lives on the default branch's own
 * first-parent line, so every branch cut from the default branch afterwards inherits it.
 *
 * The evidence is derived from bit's own data — the `.bitmap` committed on the branch — and has two
 * independent parts: *attribution* (does the branch's `.bitmap` lane pointer name this lane?) and
 * *reachability* (is the commit that wrote that `.bitmap`, or the branch tip, already in the default
 * branch?). "The state commit" below means the newest commit on the branch's own first-parent line that
 * changed `.bitmap`:
 *
 * - `own-live` — the `.bitmap` names this lane, and its state commit is **not** in the default branch. This
 *   is a real, still-unmerged lane branch of ours. Retiring it is what `close-pr` is for — but deleting it
 *   additionally requires that nothing sits above the state commit (see `planLaneSync`): the PR was never
 *   merged, so dev commits on top reached neither the lane nor the default branch.
 * - `own-merged` — the `.bitmap` names this lane, and the branch **tip** is already in the default
 *   branch. Everything on the branch is in the default branch, so deleting it loses nothing. (This is the
 *   just-merged lane whose branch the git host did not auto-delete.)
 * - `own-superseded` — the `.bitmap` names this lane and its state commit is one the default branch already
 *   contains, but the branch tip it does not: the sync PR was merged and then work continued on the branch.
 *   The PR should be closed, but the branch must be **kept** — those commits exist nowhere else.
 * - `inherited-or-none` — the branch's `.bitmap` has no lane pointer, names a *different* lane, or could not
 *   be read/parsed at all. The branch is not ours; touch nothing.
 */
export type LaneOwnershipEvidence = 'own-live' | 'own-merged' | 'own-superseded' | 'inherited-or-none';

export type LaneSyncInput = {
  /** fingerprint of the lane's component heads on bit.cloud; undefined when the lane is gone */
  laneHead?: string;
  branchExists: boolean;
  /**
   * **S** — the same fingerprint computed over the lane's components *as the branch's committed `.bitmap`
   * records them*. Undefined when the branch holds no state for this lane (its `.bitmap` has no lane pointer,
   * points at another lane, or could not be read). Equality with `laneHead` is the definition of converged.
   */
  lastSyncedHead?: string;
  /** whether the branch carries commits on top of the commit that last wrote its `.bitmap` */
  hasDevCommits: boolean;
  conflictLabelPresent: boolean;
  /** @see LaneOwnershipEvidence — consulted only on the "lane is gone" path. */
  ownership: LaneOwnershipEvidence;
};

export type LaneSyncAction =
  | { type: 'noop'; reason: string }
  | { type: 'import-lane' }
  | { type: 'export-branch' }
  | { type: 'merge-diverged' }
  /** `deleteBranch: false` closes the PR but leaves the branch — see `own-superseded`. */
  | { type: 'close-pr'; deleteBranch: boolean }
  | { type: 'halt'; reason: string };

export function planLaneSync(input: LaneSyncInput): LaneSyncAction {
  const { laneHead, branchExists, lastSyncedHead, hasDevCommits, conflictLabelPresent, ownership } = input;
  if (conflictLabelPresent) {
    return { type: 'noop', reason: 'PR is labeled bit-sync-conflict; resolve and remove the label to resume' };
  }
  if (!laneHead) {
    if (!branchExists) return { type: 'noop', reason: 'lane and branch both absent' };
    // The lane is gone and the branch is not. Whether that means "retire it" depends entirely on how good
    // the claim on the branch is — see `LaneOwnershipEvidence`, which is where the reasoning lives.
    switch (ownership) {
      case 'own-live':
        // The sync commit never reached the default branch — the PR was never merged — so dev commits
        // above it never reached the lane or the default branch either: that content exists in NO other
        // ref, and deleting the branch would destroy it. Without dev commits the branch is exactly the
        // lane's mirror, and removing the lane on bit.cloud is the human saying that content is done with.
        return { type: 'close-pr', deleteBranch: !hasDevCommits };
      case 'own-merged':
        return { type: 'close-pr', deleteBranch: true };
      case 'own-superseded':
        // Data preservation beats tidiness: those commits are in no other ref.
        return { type: 'close-pr', deleteBranch: false };
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
