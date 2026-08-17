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

/**
 * `snapPrCommit`'s return value when there was nothing to snap — its only signal either way. Lives in
 * this leaf module so `ci.main.runtime.ts` and `lane-sync-executor.ts` share it without a cycle.
 */
export const NO_CHANGES_TO_SNAP = 'No changes detected, nothing to snap';

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

/** The record separator `hasIndependentHistoryBelowStateCommit`'s `git log --format=%B%x1e` uses. */
const COMMIT_MESSAGE_RECORD_SEPARATOR = '\x1e';

/**
 * Whether the OLDEST record of a `git log --reverse --format=%B%x1e` run is NOT bit-authored — i.e. a
 * human created the branch before this reconciler touched it. Oldest only, not "any": ordinary lane
 * branches carry real dev commits between ledger commits too, and "any" would misclassify them all.
 */
export function oldestCommitIsNonSync(rawLog: string): boolean {
  const messages = rawLog
    .split(COMMIT_MESSAGE_RECORD_SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const oldest = messages[0];
  return oldest !== undefined && !isLedgerCommitMessage(oldest);
}

/**
 * Strict probe for "this is one of our LEDGER commits": the sync marker on its own line AND the
 * `Bit-Lane-Head` trailer — `buildSyncCommitMessage` always writes both. The deletion guard reads
 * this instead of `isSyncAuthoredMessage` so a human commit merely quoting `[bit-sync]` still counts
 * as independent history (a false "human" only ever keeps a branch).
 */
export function isLedgerCommitMessage(message: string): boolean {
  return isSyncAuthoredMessage(message) && new RegExp(`^${LANE_HEAD_TRAILER}: `, 'm').test(message);
}

/**
 * Marks `adopt-branch`'s ledger commit. Audit-only — the deletion guard reads the branch's ancestry
 * instead, since a trailer marks only the one commit it is on and later ledger commits carry none.
 */
export const ADOPTION_TRAILER = 'Bit-Adopted';

/**
 * The sync commit's message. Every part is an annotation (audit trail + loop-guard marker); nothing reads
 * it as state — messages are forgeable and rewritten on squash-merge. State comes from `.bitmap`.
 */
export function buildSyncCommitMessage(laneIdStr: string, laneHead: string, opts: { adopted?: boolean } = {}): string {
  return [
    `chore(bit-sync): sync lane ${laneIdStr} @ ${laneHead.slice(0, 9)}`,
    '',
    `${LANE_HEAD_TRAILER}: ${laneHead}`,
    ...(opts.adopted ? [`${ADOPTION_TRAILER}: true`] : []),
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
  /**
   * Whether the state commit itself — a commit this reconciler did not write — also touched files
   * besides `.bitmap`. SUSPECTED work only: those files may already be inside the snap the `.bitmap`
   * records, which git cannot tell, so the executor probes with a snap. Note this is true for ANY
   * other path, `docs/` and CI config included — the probe is the only thing that distinguishes real
   * work, and it records the sync ledger either way so a clean answer is not re-probed forever.
   */
  stateCommitBundlesSources: boolean;
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

  // Source edits can RIDE IN the state commit itself — one commit changing `.bitmap` AND sources (the
  // exact shape the conflict-halt comment's resolve-by-hand recipe produces) — and the range count
  // starts after that commit, so they were invisible. Git file names alone cannot tell whether those
  // sources are already inside the snap the `.bitmap` records (a dev who snapped, exported, and
  // committed everything at once) or were never snapped at all — so this is SUSPECTED work, reported
  // separately for the planner to probe rather than folded into `hasDevCommits`. Only a commit this
  // reconciler did not write can be that shape: its own ledger commits legitimately bundle merged
  // sources (merge-diverged) and are already-exported state.
  const stateCommitBundlesSources =
    !parseDevCommitCount(count) &&
    stateCommit !== undefined &&
    stateCommit === tipSha &&
    !isSyncAuthoredMessage(tipMessage) &&
    (await commitTouchesBeyondBitmap(stateCommit));

  return {
    stateCommit,
    bitmap,
    hasDevCommits: parseDevCommitCount(count),
    stateCommitBundlesSources,
    tipMessage,
    tipSha,
  };
}

/**
 * Whether `commit` changed any file besides `.bitmap`, against its first parent (`--root` covers an
 * initial commit; `-m --first-parent` makes a merge commit report the files it brought in, instead of
 * the silent empty diff plain `diff-tree` gives merges). Unreadable answers `true`: this feeds
 * `stateCommitBundlesSources`, where not knowing must plan the probe, never declare convergence.
 */
async function commitTouchesBeyondBitmap(commit: string): Promise<boolean> {
  try {
    const names = await git.raw([
      'diff-tree',
      '--no-commit-id',
      '--name-only',
      '-r',
      '--root',
      '-m',
      '--first-parent',
      commit,
    ]);
    // A state commit changed `.bitmap` by definition, so its first-parent diff is never empty — empty
    // output is simple-git resolving on a non-zero exit (see `parseDevCommitCount`), i.e. unreadable.
    if (!names.trim()) return true;
    return touchesBeyondBitmap(names);
  } catch {
    return true;
  }
}

/** The pure half of `commitTouchesBeyondBitmap`, split out so it is testable without a real git log. */
export function touchesBeyondBitmap(rawNames: string): boolean {
  return rawNames
    .split('\n')
    .map((name) => name.trim())
    .filter(Boolean)
    .some((name) => name !== BIT_MAP);
}

/**
 * Whether `branch`'s committed `.bitmap` is byte-identical (by blob sha) to the one at its merge-base
 * with the default branch — i.e. the branch never asserted a `.bitmap` change of its own, so whatever
 * pointer it carries is INHERITED. Compared at the fork point, not the default branch's current tip,
 * which moves on and would false-block. False on any git error: unreadable must not license adoption.
 */
export async function branchBitmapUnchangedSinceFork(branch: string, defaultBranch: string): Promise<boolean> {
  try {
    const base = (await git.raw(['merge-base', `origin/${defaultBranch}`, `origin/${branch}`])).trim();
    if (!base) return false;
    const [branchBlob, baseBlob] = await Promise.all([
      git.raw(['rev-parse', `origin/${branch}:./${BIT_MAP}`]),
      git.raw(['rev-parse', `${base}:./${BIT_MAP}`]),
    ]);
    const branchSha = branchBlob.trim();
    return Boolean(branchSha) && branchSha === baseBlob.trim();
  } catch {
    return false;
  }
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
