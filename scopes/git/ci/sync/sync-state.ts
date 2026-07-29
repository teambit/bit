import { git } from '../git';

export const LANE_HEAD_TRAILER = 'Bit-Lane-Head';
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

export type BranchSyncState = {
  lastSyncedHead?: string;
  syncCommitSha?: string;
  hasDevCommits: boolean;
};

/**
 * Read the sync state of a remote branch from git history alone.
 * `defaultBranch` is used when the branch has no sync commit: dev commits then means
 * "commits on origin/<branch> that are not on origin/<defaultBranch>".
 * Assumes `git fetch origin` already ran this process (executor does it once up front).
 */
export async function readBranchSyncState(branch: string, defaultBranch: string): Promise<BranchSyncState> {
  const log = await git.log([`origin/${branch}`, '--max-count=200']);
  let lastSyncedHead: string | undefined;
  let syncCommitSha: string | undefined;
  let hasDevCommits = false;
  for (const entry of log.all) {
    const message = entry.body ? `${entry.message}\n\n${entry.body}` : entry.message;
    const head = parseLaneHeadTrailer(message);
    if (head) {
      lastSyncedHead = head;
      syncCommitSha = entry.hash;
      break;
    }
  }
  if (syncCommitSha) {
    const since = await git.raw(['rev-list', `${syncCommitSha}..origin/${branch}`, '--count']);
    hasDevCommits = parseInt(since.trim(), 10) > 0;
  } else {
    const ahead = await git.raw(['rev-list', `origin/${defaultBranch}..origin/${branch}`, '--count']);
    hasDevCommits = parseInt(ahead.trim(), 10) > 0;
  }
  return { lastSyncedHead, syncCommitSha, hasDevCommits };
}
