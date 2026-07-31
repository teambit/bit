import { BIT_MAP } from '@teambit/legacy.constants';
import { git } from '../git';
import type { BranchBitmapState } from './bitmap-state';
import { parseBranchBitmap } from './bitmap-state';

export const LANE_HEAD_TRAILER = 'Bit-Lane-Head';
/**
 * Marks a commit as machine-generated. Duplicated in the `bit-git-sync` action repo's event router
 * (the loop guard) — changing one copy without the other makes the reconciler re-trigger itself.
 */
export const SYNC_COMMIT_MARKER = '[bit-sync]';
export const CONFLICT_LABEL = 'bit-sync-conflict';

/**
 * Permissive substring probe for "looks machine-generated" — the loop guard. Must NOT decide anything
 * irreversible; see `isSyncAuthoredMessage`.
 */
export function hasSyncMarker(message: string): boolean {
  return message.includes(SYNC_COMMIT_MARKER);
}

/**
 * Strict probe for "we wrote this commit": the marker alone on its own line. This is an input to branch
 * deletion, so a developer merely quoting the marker must never count as authorship. `\r?` tolerates CRLF;
 * a recognition failure errs toward keeping the branch.
 */
export function isSyncAuthoredMessage(message: string): boolean {
  return new RegExp(`^${SYNC_COMMIT_MARKER.replace(/[[\]]/g, '\\$&')}\\r?$`, 'm').test(message);
}

/**
 * The sync commit's message. Every part is an annotation (audit trail + loop-guard marker); nothing reads
 * it as state — messages are forgeable and rewritten on squash-merge. State comes from `.bitmap`.
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
   * The newest first-parent commit that changed `.bitmap` — the reachability anchor for branch ownership
   * and the baseline for `hasDevCommits`. Undefined when `.bitmap` was never written on the branch.
   */
  stateCommit?: string;
  /**
   * The branch tip's `.bitmap`, parsed; undefined when absent/unparseable (treated as "not ours").
   * Reading at the tip equals reading at `stateCommit` — nothing after it changed the file.
   */
  bitmap?: BranchBitmapState;
  /** Whether the branch carries commits on top of its bit state — work bit has not seen. */
  hasDevCommits: boolean;
  /** The branch tip's full commit message (subject + body), for the sync-marker loop-guard probe. */
  tipMessage: string;
};

/**
 * Read a remote branch's sync state from its committed `.bitmap`. Assumes `git fetch origin` already ran.
 * `--first-parent` is a correctness requirement: `git log` orders across all parents, so a `.bitmap`
 * change that arrived through a merge would otherwise be picked as this branch's own state commit.
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
 * A file's content at a git ref, or undefined when it isn't there. simple-git's `raw` can resolve with
 * empty output instead of rejecting on a missing path; `:./` keeps the path cwd-relative in case the
 * workspace is a subdirectory of the repo.
 */
async function readFileAtRef(revision: string, filePath: string): Promise<string | undefined> {
  try {
    return await git.raw(['show', `${revision}:./${filePath}`]);
  } catch {
    return undefined;
  }
}
