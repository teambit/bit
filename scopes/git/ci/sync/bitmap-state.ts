import { BitMap } from '@teambit/legacy.bit-map';
import { sha1 } from '@teambit/toolbox.crypto.sha1';

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
