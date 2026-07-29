import { git } from '../git';

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

export function parseLaneHeadTrailer(message: string): string | undefined {
  const match = message.match(new RegExp(`^${LANE_HEAD_TRAILER}:\\s*(\\S+)`, 'm'));
  return match?.[1];
}

export function hasSyncMarker(message: string): boolean {
  return message.includes(SYNC_COMMIT_MARKER);
}

export function isSyncCommitMessage(message: string): boolean {
  return message.includes(SYNC_COMMIT_MARKER) && parseLaneHeadTrailer(message) !== undefined;
}

export function buildSyncCommitMessage(laneIdStr: string, laneHead: string): string {
  return [
    `chore(bit-sync): sync lane ${laneIdStr} @ ${laneHead.slice(0, 9)}`,
    '',
    `${LANE_HEAD_TRAILER}: ${laneHead}`,
    SYNC_COMMIT_MARKER,
  ].join('\n');
}

/**
 * The lane id `buildSyncCommitMessage` recorded in a sync commit's **subject**, if the subject has that
 * exact shape.
 *
 * This is what tells "a sync commit written for *this* pair" apart from "a sync commit this branch merely
 * inherited". The `Bit-Lane-Head` trailer cannot: once a sync PR is squash-, rebase- or fast-forward-merged,
 * its trailer sits on the **default branch's own first-parent line**, so every branch forked from the
 * default branch afterwards carries it and looks, by trailer alone, like a branch the reconciler created.
 * The subject names the lane, so it distinguishes them.
 */
export function parseSyncCommitLaneId(message: string): string | undefined {
  return message.match(/^chore\(bit-sync\): sync lane (\S+) @ /m)?.[1];
}

/** A sync commit found in a branch's history: identified by its trailer, attributed by its subject. */
export type SyncCommit = {
  hash: string;
  /** full raw message (subject + body) */
  message: string;
  /** the `Bit-Lane-Head` trailer value — always set, because it is what identified this commit */
  laneHead: string;
  /** the lane id named in the subject, when the subject has `buildSyncCommitMessage`'s shape */
  laneIdStr?: string;
};

export type BranchSyncState = {
  /**
   * The newest sync commit on the branch's **own** (first-parent) line, if it has one. This is the single
   * record of "what has this branch been synced to, and by whom" — callers derive both the last synced
   * lane head and the branch-ownership question from it, rather than being handed pre-digested booleans
   * that could disagree with each other.
   */
  syncCommit?: SyncCommit;
  /** Whether the branch carries commits the lane has never seen. */
  hasDevCommits: boolean;
  /** The branch tip's full commit message (subject + body), for the sync-marker loop-guard probe. */
  tipMessage: string;
};

/**
 * `git log --format` value that emits, per commit, the sha on its own line followed by the full raw
 * message, terminated by a NUL. NUL is the one byte a commit message cannot contain, so it is the only
 * safe record separator here — a message body can contain blank lines, `\r`, and anything else a
 * text-based delimiter would collide with.
 */
const LOG_FORMAT = '--format=%H%n%B%x00';

/** Parse the `LOG_FORMAT` stream into `{ hash, message }` records, dropping the trailing empty one. */
function parseLogRecords(out: string): Array<{ hash: string; message: string }> {
  return out
    .split('\0')
    .map((record) => record.replace(/^\n+/, ''))
    .filter((record) => record.trim().length > 0)
    .map((record) => {
      const newline = record.indexOf('\n');
      return newline === -1
        ? { hash: record.trim(), message: '' }
        : { hash: record.slice(0, newline).trim(), message: record.slice(newline + 1).trimEnd() };
    });
}

/**
 * Read the sync state of a remote branch from git history alone.
 * `defaultBranch` is used when the branch has no sync commit: dev commits then means
 * "commits on origin/<branch> that are not on origin/<defaultBranch>".
 * Assumes `git fetch origin` already ran this process (executor does it once up front).
 *
 * The sync commit is located with `--grep` rather than by walking the last N commits. A window is not a
 * safe way to find it: merging the default branch into a long-lived lane branch brings in *all* of that
 * branch's history, so a repository with any real commit volume pushes the branch's own sync commit
 * arbitrarily far back within one merge. The window would then report `lastSyncedHead: undefined` for a
 * branch that has been synced many times, and the planner would halt with "branch has commits but no
 * Bit-Lane-Head trailer" — a reason that is simply false. `--grep` asks git to find it however deep it
 * is, and costs the same.
 *
 * `--first-parent` is a correctness requirement, not an optimization. `git log` orders by commit date
 * across *all* parents, so a `Bit-Lane-Head` commit that arrived through a **merge** — someone merged the
 * default branch, which contains another lane's sync commit, or the branch once merged a different sync
 * branch — has a newer commit date than this branch's own sync commit and would be picked instead. The
 * adopted `lastSyncedHead` would then be another lane's fingerprint: it never equals this lane's head, so
 * every run reads the lane as moved and re-plans work that was already done, and idempotence is gone.
 * First-parent traversal restricts the walk to this branch's own line of development, which is the only
 * line whose sync commits describe *this* pair. (It also bounds the walk.)
 *
 * All matches on that line are scanned rather than just the newest, because `--grep` matches the trailer
 * *anywhere* in a message (a developer quoting a previous sync commit in their own body would match) while
 * `parseLaneHeadTrailer` only accepts it at the start of a line. Taking `-n 1` would let such a commit
 * mask the real sync commit behind it.
 *
 * **Known cost of `--first-parent`.** If a developer resolves a lane branch's remote update with a merge
 * rather than a rebase — a plain `git pull` on the branch after a sync run pushed to it — the sync commit
 * we wrote ends up on the *second* parent, and this walk will not see it. `lastSyncedHead` then falls back
 * to an older sync commit (or none), the lane reads as moved, and the run plans `merge-diverged` where
 * `export-branch` was the truth. That converges — `merge-diverged` merges the lane into the branch and
 * snaps the result, and the fresh trailer it pushes lands back on the first-parent line — so the cost is
 * one round of churn, not a wrong outcome. It is the deliberate trade against the alternative, which is
 * adopting *another pair's* fingerprint and never converging at all.
 */
export async function readBranchSyncState(branch: string, defaultBranch: string): Promise<BranchSyncState> {
  const revision = `origin/${branch}`;
  const [tip] = parseLogRecords(await git.raw(['log', revision, '-n', '1', LOG_FORMAT]));
  const candidates = parseLogRecords(
    await git.raw(['log', revision, '--first-parent', `--grep=${LANE_HEAD_TRAILER}:`, LOG_FORMAT])
  );

  let syncCommit: SyncCommit | undefined;
  for (const candidate of candidates) {
    const laneHead = parseLaneHeadTrailer(candidate.message);
    if (!laneHead) continue;
    syncCommit = { ...candidate, laneHead, laneIdStr: parseSyncCommitLaneId(candidate.message) };
    break;
  }

  // Dev commits are counted from the sync commit when there is one — anything on top of it is work the
  // lane has never seen. Without one there is no baseline on the branch, so the default branch (the
  // branch's fork point) is the next best one.
  const range = syncCommit ? `${syncCommit.hash}..${revision}` : `origin/${defaultBranch}..${revision}`;
  const count = await git.raw(['rev-list', range, '--count']);

  return { syncCommit, hasDevCommits: parseInt(count.trim(), 10) > 0, tipMessage: tip?.message ?? '' };
}
