/**
 * How much of a claim *this* lane/branch pair has on `origin/<branch>` — the only thing that licenses
 * retiring it, because `close-pr` **deletes the branch**.
 *
 * The problem this exists to solve: under the documented defaults (`branchPrefix: ''`, `lanes: ['*']`)
 * every branch name maps to a same-named lane, so an ordinary developer branch with no lane reaches the
 * planner with exactly the same `laneHead`/`branchExists` shape as a lane branch whose lane was just
 * deleted. "Does the branch carry a `Bit-Lane-Head` trailer" is *not* enough to tell them apart either:
 * once a sync PR is squash-, rebase- or fast-forward-merged, its trailer lives on the default branch's own
 * first-parent line, so every branch cut from the default branch afterwards inherits one.
 *
 * So the evidence has two independent parts — *attribution* (does the sync commit name this lane?) and
 * *reachability* (is that commit, or the branch tip, already in the default branch?):
 *
 * - `own-live` — a sync commit naming this lane, and it is **not** in the default branch. This is a real,
 *   still-unmerged lane branch of ours. Retiring it is what `close-pr` is for.
 * - `own-merged` — a sync commit naming this lane, and the branch **tip** is already in the default
 *   branch. Everything on the branch is in the default branch, so deleting it loses nothing. (This is the
 *   just-merged lane whose branch the git host did not auto-delete.)
 * - `own-superseded` — a sync commit naming this lane which the default branch already contains, but the
 *   branch tip it does not: the sync PR was merged and then work continued on the branch. The PR should be
 *   closed, but the branch must be **kept** — those commits exist nowhere else.
 * - `inherited-or-none` — no sync commit on the branch's own line, or one that names a *different* lane.
 *   The branch is not ours; touch nothing.
 */
export type LaneOwnershipEvidence = 'own-live' | 'own-merged' | 'own-superseded' | 'inherited-or-none';

export type LaneSyncInput = {
  laneHead?: string;
  branchExists: boolean;
  lastSyncedHead?: string;
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
