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
  /**
   * Whether the branch tip carries the `[bit-sync]` marker — i.e. whether the *reconciler itself* wrote the
   * commit the branch currently ends on.
   *
   * **This is the one deliberate exception to "markers are annotations".** It is consulted on exactly one
   * path — the decision to `git push origin --delete`, the single irreversible thing this command does — and
   * only ever to WITHHOLD a deletion, never to authorize one. See the `own-live` case below for why bit-native
   * attribution alone is not sufficient there.
   */
  tipIsSyncCommit: boolean;
  conflictLabelPresent: boolean;
  /** @see LaneOwnershipEvidence — consulted only on the "lane is gone" path. */
  ownership: LaneOwnershipEvidence;
};

/**
 * Why a `close-pr` is keeping the branch rather than deleting it. The two reasons are told apart because they
 * need different sentences: one says "there is work here that exists nowhere else", the other says "we did
 * not write the tip, so we cannot vouch for what is in it" — and a reader who is told the wrong one will go
 * looking for the wrong thing.
 */
export type BranchKeepReason = 'unmerged-commits' | 'tip-not-a-sync-commit';

export type LaneSyncAction =
  | { type: 'noop'; reason: string }
  | { type: 'import-lane' }
  | { type: 'export-branch' }
  | { type: 'merge-diverged' }
  /** `deleteBranch: false` closes the PR but leaves the branch — `keepReason` is then always set. */
  | { type: 'close-pr'; deleteBranch: boolean; keepReason?: BranchKeepReason }
  | { type: 'halt'; reason: string };

export function planLaneSync(input: LaneSyncInput): LaneSyncAction {
  const { laneHead, branchExists, lastSyncedHead, hasDevCommits, conflictLabelPresent, ownership } = input;
  const { tipIsSyncCommit } = input;
  if (conflictLabelPresent) {
    return { type: 'noop', reason: 'PR is labeled bit-sync-conflict; resolve and remove the label to resume' };
  }
  if (!laneHead) {
    if (!branchExists) return { type: 'noop', reason: 'lane and branch both absent' };
    // The lane is gone and the branch is not. Whether that means "retire it" depends entirely on how good
    // the claim on the branch is — see `LaneOwnershipEvidence`, which is where the reasoning lives.
    switch (ownership) {
      case 'own-live':
        // The state commit never reached the default branch — the PR was never merged — so anything above it
        // never reached the lane or the default branch either: that content exists in NO other ref, and
        // deleting the branch would destroy it.
        //
        // DELETION NEEDS BOTH HALVES. `.bitmap` attribution alone is not enough here, and this is the one
        // place where that matters. A developer working on a lane branch who runs `bit create`, an
        // unexported `bit snap`, or `bit deps set` and commits the result has written `.bitmap` themselves:
        // their commit becomes the state commit, the tip IS the state commit (so `hasDevCommits` is false),
        // and the lane pointer they inherited is still in the file. Every structural test then says
        // "own-live, nothing above the state commit" — and the branch, carrying work that was never
        // exported, gets deleted. The v1 subject-format check happened to exclude this because it only ever
        // matched commits the reconciler itself wrote.
        //
        // So the branch is retired only when the reconciler can see BOTH that the branch is structurally
        // ours (the `.bitmap` pointer, which no commit message can forge) AND that it wrote the tip itself
        // (the marker). The marker is necessary but never sufficient: it cannot authorize a deletion on its
        // own, it can only withhold one. The conjunction is strictly safer than either half alone, and it is
        // deliberately asymmetric — a false "keep" leaves a stale branch for a human to delete, a false
        // "delete" destroys the only copy of someone's work.
        if (!hasDevCommits && tipIsSyncCommit) return { type: 'close-pr', deleteBranch: true };
        return {
          type: 'close-pr',
          deleteBranch: false,
          keepReason: hasDevCommits ? 'unmerged-commits' : 'tip-not-a-sync-commit',
        };
      case 'own-merged':
        // No conjunction here, and it is not an oversight: `own-merged` means the branch **tip** is already
        // an ancestor of the default branch, so every commit on the branch — whoever wrote it — is reachable
        // from the default branch. That is an independent, unforgeable proof that deleting loses nothing,
        // which is exactly what the marker check exists to establish on the `own-live` path where no such
        // proof is available.
        return { type: 'close-pr', deleteBranch: true };
      case 'own-superseded':
        // Data preservation beats tidiness: those commits are in no other ref.
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
