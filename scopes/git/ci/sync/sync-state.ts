import { BIT_MAP } from '@teambit/legacy.constants';
import { git } from '../git';
import type { BranchBitmapState } from './bitmap-state';
import { parseBranchBitmap } from './bitmap-state';

export const LANE_HEAD_TRAILER = 'Bit-Lane-Head';
/**
 * The marker that makes a commit recognizably machine-generated, on both sync commit shapes (a lane
 * sync commit also carries a `Bit-Lane-Head` trailer; a main sync commit carries only this).
 *
 * **This string is duplicated across repositories.** The `bit-git-sync` action repo's event router
 * matches the same literal to decide that a `push` was our own and must not re-trigger a sync — that is
 * the loop guard. The two copies are a cross-repo pair: changing this value without changing the router's
 * makes every sync commit look like a developer push and the reconciler starts triggering itself.
 */
export const SYNC_COMMIT_MARKER = '[bit-sync]';
export const CONFLICT_LABEL = 'bit-sync-conflict';

/**
 * Cheap, permissive probe for "this looks machine-generated": a bare substring match.
 *
 * This is the LOOP GUARD, and permissive is right for it — the cost of a false positive is one skipped
 * redundant run, and the `bit-git-sync` action repo's event router matches the same literal the same way.
 * It must NOT be used to decide anything irreversible; see `isSyncAuthoredMessage`.
 */
export function hasSyncMarker(message: string): boolean {
  return message.includes(SYNC_COMMIT_MARKER);
}

/**
 * Strict probe for "**we** wrote this commit" — the marker standing alone on its own line, which is where
 * `buildSyncCommitMessage` puts it and the only place it appears in a message the reconciler authored.
 *
 * The distinction from `hasSyncMarker` is the whole point, and it exists because this predicate is the one
 * message-derived input to a **branch deletion**. A substring match is satisfied by a message that merely
 * *mentions* the marker — `revert the [bit-sync] bitmap churn` is a perfectly natural thing for a developer
 * to write on a commit that also touches `.bitmap`, and that combination is exactly the laundering shape the
 * deletion conjunction exists to stop. Quoting a marker must never amount to claiming authorship.
 *
 * `\r?` tolerates a message committed with CRLF endings. Note which way an anchoring failure errs: a sync
 * commit we fail to recognize means the branch is *kept*, which is the harmless direction.
 */
export function isSyncAuthoredMessage(message: string): boolean {
  return new RegExp(`^${SYNC_COMMIT_MARKER.replace(/[[\]]/g, '\\$&')}\\r?$`, 'm').test(message);
}

/**
 * The sync commit's message. Every part of it is an **annotation** — a human audit trail, plus the
 * `[bit-sync]` marker the action repo's event router matches to skip re-triggering on our own push.
 * **Nothing reads any of it as state** (see `readBranchSyncState`): the subject, the `Bit-Lane-Head`
 * trailer and the marker are all forgeable by anyone who can write a commit message, and none of them
 * survives a git host rewriting the message on squash-merge. State comes from `.bitmap`.
 *
 * The trailer's value is `laneHeadFingerprint`, which is still what the branch's `.bitmap` will produce
 * for a converged pair — so it stays a genuinely useful thing for a human to read off `git log`.
 */
export function buildSyncCommitMessage(laneIdStr: string, laneHead: string): string {
  return [
    `chore(bit-sync): sync lane ${laneIdStr} @ ${laneHead.slice(0, 9)}`,
    '',
    `${LANE_HEAD_TRAILER}: ${laneHead}`,
    SYNC_COMMIT_MARKER,
  ].join('\n');
}

export type BranchSyncState = {
  /**
   * The newest commit on the branch's **own** (first-parent) line that changed `.bitmap` — the commit that
   * put the branch in the bit state it is in. It is the reachability anchor for branch ownership (is the
   * branch's bit state already in the default branch?) and the baseline for `hasDevCommits`.
   *
   * Undefined only for a branch on which `.bitmap` was never written at all.
   */
  stateCommit?: string;
  /**
   * The branch tip's `.bitmap`, parsed — the branch's bit state: which lane it mirrors and at which
   * component versions. Undefined when the file is absent, unreadable or unparseable, which every caller
   * treats as "not ours" (see `parseBranchBitmap`).
   *
   * Read at the **tip** rather than at `stateCommit`, and that is not an approximation: `stateCommit` is by
   * construction the last first-parent commit whose `.bitmap` differs from its predecessor's, so nothing
   * between it and the tip changed the file. The two are the same bytes.
   */
  bitmap?: BranchBitmapState;
  /** Whether the branch carries commits on top of its bit state — work bit has not seen. */
  hasDevCommits: boolean;
  /** The branch tip's full commit message (subject + body), for the sync-marker loop-guard probe. */
  tipMessage: string;
};

/**
 * Read the sync state of a remote branch **from bit's own data**: the `.bitmap` the branch has committed.
 * Assumes `git fetch origin` already ran this process (executor does it once up front).
 *
 * git is used only for what git alone can answer — *which* blob, and *what is reachable from what*:
 *
 * - **the state commit** — `git log --first-parent -1 -- .bitmap`. `--first-parent` is a correctness
 *   requirement, not an optimization, and it is the same one the previous (trailer-walking) implementation
 *   needed: `git log` orders by commit date across *all* parents, so a `.bitmap` change that arrived through
 *   a **merge** (someone merged the default branch, or another sync branch, into this one) is newer than this
 *   branch's own and would be picked instead. The anchor would then be a commit describing a different pair.
 *   First-parent traversal restricts the walk to this branch's own line of development, which is the only
 *   line whose state describes *this* pair. (It also bounds the walk.)
 * - **the state itself** — `git show origin/<branch>:./.bitmap`, parsed with bit's own `BitMap`.
 * - **dev commits** — how many commits sit on top of the state commit. Without a state commit at all there is
 *   no baseline on the branch, so the default branch (the branch's fork point) is the next best one.
 *
 * **Why this is better than the `Bit-Lane-Head`/subject walk it replaces**, beyond being bit-native:
 * a squash-, rebase- or ff-merge rewrites commit *messages* and the old attribution died with them, while
 * `.bitmap` is content and survives; a developer quoting a sync commit in their own message could no longer
 * be mistaken for one; and a developer who legitimately advances the branch's bit state (snap + export, then
 * commit the resulting `.bitmap`) is now seen as *having moved the state* rather than as having piled
 * unrelated dev commits on a stale one — so the planner reads such a branch as converged instead of
 * manufacturing a `merge-diverged` round of churn.
 *
 * **Known cost of `--first-parent`** (unchanged from v1). If a developer resolves a lane branch's remote
 * update with a merge rather than a rebase — a plain `git pull` on the branch after a sync run pushed to it —
 * the sync commit we wrote ends up on the *second* parent. Its `.bitmap` is nevertheless what the merge
 * result carries, so the merge commit itself becomes the state commit (its `.bitmap` differs from its first
 * parent's), and the state read is correct. This is strictly better than v1, where the trailer was simply
 * invisible and the run re-planned work already done.
 */
export async function readBranchSyncState(
  branch: string,
  defaultBranch: string,
  defaultScope: string
): Promise<BranchSyncState> {
  const revision = `origin/${branch}`;
  const tipMessage = (await git.raw(['log', revision, '-n', '1', '--format=%B'])).trimEnd();
  const stateCommit =
    (await git.raw(['log', revision, '--first-parent', '-n', '1', '--format=%H', '--', BIT_MAP])).trim() || undefined;

  const bitmap = parseBranchBitmap(await readFileAtRef(revision, BIT_MAP), defaultScope);

  const range = stateCommit ? `${stateCommit}..${revision}` : `origin/${defaultBranch}..${revision}`;
  const count = await git.raw(['rev-list', range, '--count']);

  return { stateCommit, bitmap, hasDevCommits: parseInt(count.trim(), 10) > 0, tipMessage };
}

/**
 * A file's content at a git ref, or undefined when it isn't there.
 *
 * Both failure shapes have to be handled: simple-git's `raw` *resolves* rather than rejects on some non-zero
 * exits (the trap `isAncestor` in `git-ops.ts` documents), so a missing path can come back either as a
 * rejection or as empty output. `:./` makes the path relative to the working directory rather than to the
 * repository root, so this stays correct if the workspace is ever a subdirectory of the repo.
 */
async function readFileAtRef(revision: string, filePath: string): Promise<string | undefined> {
  try {
    return await git.raw(['show', `${revision}:./${filePath}`]);
  } catch {
    return undefined;
  }
}
