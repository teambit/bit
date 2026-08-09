import { BitMap } from '@teambit/legacy.bit-map';
import { BIT_MAP } from '@teambit/legacy.constants';
import { sha1 } from '@teambit/toolbox.crypto.sha1';
import { git } from '../git';

/**
 * Sync state is derived from the `.bitmap` committed on a branch — the lane pointer (`_bit_lane`) and the
 * per-component versions — never from commit messages, which are forgeable and rewritten by squash/rebase.
 */

/** What a branch's committed `.bitmap` says about the branch's bit state. */
export type BranchBitmapState = {
  /**
   * The scope-qualified lane id `.bitmap` points at (`<scope>/<name>`), or undefined when there is no
   * usable pointer — none at all (branch on main), or one bit marked not exported.
   */
  laneIdStr?: string;
  /** `<scope>/<name>` -> version (a snap hash, or a semver tag on main), exactly as `.bitmap` records it. */
  versions: Record<string, string>;
};

/**
 * Parse a `.bitmap` file's content — no workspace, no filesystem. Fail-safe: an unreadable file returns
 * undefined, and a pointer that parses but cannot attribute (unscoped id, `exported: false`) withholds
 * `laneIdStr`; either way no lane id licenses nothing, so a parse failure can never authorize a deletion.
 * An unexported pointer is ignored because its lane never existed on any remote and treating it as a
 * mirror would retire the branch.
 */
export function parseBranchBitmap(content: string | undefined, defaultScope: string): BranchBitmapState | undefined {
  if (!content || !content.trim()) return undefined;
  try {
    const bitMap = BitMap.loadFromContentWithoutLoadingFiles(Buffer.from(content, 'utf8'), '', '', defaultScope);
    const versions: Record<string, string> = {};
    bitMap.components.forEach((componentMap) => {
      const version = componentMap.id.version;
      // No version = never snapped/tagged; contributes nothing to the fingerprint.
      if (version) versions[componentMap.id.toStringWithoutVersion()] = version;
    });
    // An unscoped lane id cannot be attribution: every comparison target is scope-qualified.
    const laneId = bitMap.isLaneExported ? bitMap.laneId : undefined;
    const laneIdStr = laneId?.scope ? laneId.toString() : undefined;
    return { laneIdStr, versions };
  } catch {
    return undefined;
  }
}

/**
 * Fingerprint of `<component-id>@<version>` pairs: sorted (so listing/key order cannot perturb it), then
 * sha1'd (the value doubles as a single-token `Bit-Lane-Head` trailer).
 */
export function fingerprintIdVersions(idAtVersion: string[]): string {
  return sha1([...idAtVersion].sort().join('\n'));
}

/**
 * Placeholder for a lane component the branch's `.bitmap` lacks. It must participate in the fingerprint,
 * or "the lane grew a component" would fingerprint identically to "converged".
 */
export const ABSENT_ON_BRANCH = '<absent>';

/**
 * What the branch reflects, comparable to the lane's own fingerprint. Only the lane's components count:
 * the `.bitmap` also carries non-lane components at their main versions, and including those would make
 * an untouched pair read as diverged after any unrelated release.
 */
export function branchStateFingerprint(state: BranchBitmapState, laneComponentIds: string[]): string {
  return fingerprintIdVersions(laneComponentIds.map((id) => `${id}@${state.versions[id] ?? ABSENT_ON_BRANCH}`));
}

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
 * deletion and to the export-branch withhold (a branch whose tip is already our own commit settles
 * instead of re-exporting), so a developer merely quoting the marker must never count as authorship.
 * `\r?` tolerates CRLF; a recognition failure errs toward keeping the branch / re-attempting the export.
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
  /**
   * The tip sha every field above was read from. The retirement path re-reads the branch and refuses to
   * delete anything else — the evidence licensed deleting THIS commit, not a later one.
   */
  tipSha?: string;
};

/**
 * Whether a `rev-list --count` output reports commits. An unreadable count answers `true`: `false` is an
 * input to branch retirement, so not knowing must withhold a deletion rather than license one. Empty
 * output is reachable — simple-git's `raw` resolves with it on some non-zero exits.
 */
export function parseDevCommitCount(raw: string): boolean {
  const count = Number.parseInt(raw.trim(), 10);
  return Number.isNaN(count) ? true : count > 0;
}

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
  const tipSha = (await git.raw(['rev-parse', revision])).trim() || undefined;
  const tipMessage = (await git.raw(['log', revision, '-n', '1', '--format=%B'])).trimEnd();
  const stateCommit =
    (await git.raw(['log', revision, '--first-parent', '-n', '1', '--format=%H', '--', BIT_MAP])).trim() || undefined;

  const bitmap = parseBranchBitmap(await readFileAtRef(revision, BIT_MAP), defaultScope);

  const range = stateCommit ? `${stateCommit}..${revision}` : `origin/${defaultBranch}..${revision}`;
  const count = await git.raw(['rev-list', range, '--count']);

  return { stateCommit, bitmap, hasDevCommits: parseDevCommitCount(count), tipMessage, tipSha };
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
