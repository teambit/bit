import { BitMap } from '@teambit/legacy.bit-map';
import { sha1 } from '@teambit/toolbox.crypto.sha1';

/**
 * The reconciler's state is derived from **bit's own data**, not from git commit messages: the `.bitmap`
 * committed on a branch is the branch's bit state. It records two things this module extracts, and nothing
 * else in the repository can forge either by writing text into a commit:
 *
 * - the **lane pointer** (`_bit_lane`) — the scope-qualified id of the lane the branch is a mirror of. This
 *   is the *attribution* half of branch ownership. It survives squash-, rebase- and ff-merges (which rewrite
 *   commit messages), and a developer cannot produce it by quoting a sync commit in their own message.
 * - the **per-component versions** — the exact snap each component sits on, which is what "what does this
 *   branch reflect?" means at the bit level.
 *
 * See `docs/superpowers/specs/2026-07-29-bit-git-sync-design.md`, "State model v2 — bit-native".
 */

/** What a branch's committed `.bitmap` says about the branch's bit state. */
export type BranchBitmapState = {
  /**
   * The scope-qualified lane id `.bitmap` points at (`<scope>/<name>`), or undefined when the file has no
   * lane pointer at all — i.e. the branch is on main, which is what every ordinary developer branch cut from
   * the default branch looks like.
   */
  laneIdStr?: string;
  /** `<scope>/<name>` -> version (a snap hash, or a semver tag on main), exactly as `.bitmap` records it. */
  versions: Record<string, string>;
};

/**
 * Parse a `.bitmap` **file's content** — no workspace, no checkout, no filesystem.
 *
 * `BitMap.loadFromContentWithoutLoadingFiles` is bit's own parser and is documented for exactly this
 * ("helpful for external tools to get an object representation of the .bitmap file quickly"); `merge-lanes`'
 * `last-merged.ts` already uses it the same way. It is the only `BitMap` entry point that does not touch the
 * filesystem: `BitMap.load`/`loadRawSync` both resolve a path and read it, and `loadFiles()` (which this
 * never calls) is what would stat the component directories.
 *
 * **API-shape note for bit-side improvement.** The two path arguments (`bitMapFilePath`, `workspacePath`) are
 * only used for error messages and for `projectRoot`, yet they are typed `PathOsBasedAbsolute` and have no
 * default, so a caller with a Buffer and no workspace has to pass `''` twice — the same thing `last-merged.ts`
 * does. A `BitMap.parse(content, { defaultScope })` overload would express this properly.
 *
 * **Fail-safe.** Any failure — missing file, invalid JSON, a `.bitmap` entry bit refuses (a scope without a
 * version, duplicate rootDirs) — returns `undefined` rather than throwing or guessing. Every caller treats
 * that as "this branch is not ours", which is the answer that licenses nothing: no branch is retired, no
 * branch is treated as some lane's live mirror. A parse failure must never be able to authorize a deletion.
 */
export function parseBranchBitmap(content: string | undefined, defaultScope: string): BranchBitmapState | undefined {
  if (!content || !content.trim()) return undefined;
  try {
    const bitMap = BitMap.loadFromContentWithoutLoadingFiles(Buffer.from(content, 'utf8'), '', '', defaultScope);
    const versions: Record<string, string> = {};
    bitMap.components.forEach((componentMap) => {
      const version = componentMap.id.version;
      // A component with no version is one that was never snapped/tagged. It has no state to compare, and
      // it can never be on a lane, so it contributes nothing to the fingerprint.
      if (version) versions[componentMap.id.toStringWithoutVersion()] = version;
    });
    return { laneIdStr: bitMap.laneId?.toString(), versions };
  } catch {
    return undefined;
  }
}

/**
 * The fingerprint primitive shared by both sides of the comparison the planner makes: sort the
 * `<component-id>@<version>` pairs (so neither the remote's listing order nor `.bitmap`'s key order can
 * perturb it) and sha1 the join.
 *
 * sha1 rather than the join itself because the value is also written into the `Bit-Lane-Head` commit trailer
 * as an annotation, which is a single-token field — and a 40-hex token keeps the abbreviated form used in the
 * sync commit subject meaningful.
 */
export function fingerprintIdVersions(idAtVersion: string[]): string {
  return sha1([...idAtVersion].sort().join('\n'));
}

/**
 * The placeholder recorded for a lane component the branch's `.bitmap` does not have at all.
 *
 * It must be a value no real version can take, and it must *participate* in the fingerprint rather than be
 * skipped: a lane component missing from the branch is precisely a state the branch has not caught up with,
 * and dropping it silently would make "the lane grew a component" fingerprint identically to "converged".
 */
export const ABSENT_ON_BRANCH = '<absent>';

/**
 * **S** — what the branch reflects, as a value directly comparable to the lane's own fingerprint.
 *
 * Only the **lane's** components count. A branch's `.bitmap` also carries every component the workspace has
 * that is *not* on the lane (they sit at their main versions), and those move whenever main moves — including
 * them would make an untouched pair read as diverged after any unrelated release. Restricting to the lane's
 * ids is what makes `branchStateFingerprint(...) === laneHeadFingerprint(...)` mean exactly "the branch records
 * every lane component at the lane's head", which is the definition of converged.
 */
export function branchStateFingerprint(state: BranchBitmapState, laneComponentIds: string[]): string {
  return fingerprintIdVersions(laneComponentIds.map((id) => `${id}@${state.versions[id] ?? ABSENT_ON_BRANCH}`));
}
