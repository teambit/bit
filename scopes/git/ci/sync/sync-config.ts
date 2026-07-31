import { BitError } from '@teambit/bit-error';
import { assertValidBranchName, assertValidBranchPrefix } from './ref-name';

export interface CiSyncConfig {
  /** 'git-source-of-truth': lanes mirror to PRs, merges happen in GitHub. 'mirror': bit.cloud merges allowed, git tracks. */
  mode?: 'git-source-of-truth' | 'mirror';
  /** prefix for lane-mapped branches, e.g. 'lane/' => lane my-lane <-> branch lane/my-lane */
  branchPrefix?: string;
  /** explicit lane-name -> branch-name overrides */
  branches?: Record<string, string>;
  /** glob patterns of lane names to sync; [] disables lane mirroring (main-only) */
  lanes?: string[];
  /** branch used for main-scope drift sync PRs */
  mainSyncBranch?: string;
  /**
   * How the main-scope drift reaches the default branch. `'pr'` (the default) proposes the convergence:
   * the drift is committed to `mainSyncBranch` and a pull request is opened against the default branch,
   * which is never written directly. `'direct-push'` commits the drift straight onto the default branch
   * and pushes it — for mirror-style setups where the scope is the source of truth for main and the PR
   * ceremony is unwanted. Under `'direct-push'`, `mainSyncBranch` is unused.
   */
  mainSync?: 'pr' | 'direct-push';
  /**
   * What `merge-diverged` does when the lane and the branch changed the same lines. `'halt'` (the
   * default) stops that lane: the PR is labelled `bit-sync-conflict` with the resolution steps
   * commented, and a human resolves — a silent policy pick rewrites someone's work, so silence is
   * opt-in. `'git-wins'` resolves conflicting hunks to the branch's version; `'lane-wins'` resolves
   * them to the lane's version. Non-conflicting hunks always merge (union) regardless of policy — the
   * policy only decides who wins where the two sides genuinely collide. (Bit resolves at component
   * granularity: every file of a component that conflicted takes the winning side.)
   */
  onConflict?: 'halt' | 'git-wins' | 'lane-wins';
  /** enable GitHub auto-merge on the main sync PR */
  autoMergeMainSyncPr?: boolean;
}

/**
 * Resolve the configured sync options, **validating every branch name before anything runs**.
 *
 * The validation lives here because this is the first thing `sync()` does and it happens before a single
 * git command: a branch name that git cannot accept should fail the run at startup, naming the config key,
 * rather than halfway through — after commits have been made and other lanes already pushed — with git's
 * own error about a ref. The leading-`-` rule matters most: such a name is not a name at all by the time
 * it reaches a command line, it is an option.
 */
export function resolveSyncConfig(raw?: CiSyncConfig): Required<CiSyncConfig> {
  const resolved: Required<CiSyncConfig> = {
    mode: raw?.mode ?? 'git-source-of-truth',
    branchPrefix: raw?.branchPrefix ?? '',
    branches: raw?.branches ?? {},
    lanes: raw?.lanes ?? ['*'],
    mainSyncBranch: raw?.mainSyncBranch ?? 'bit-sync/main',
    autoMergeMainSyncPr: raw?.autoMergeMainSyncPr ?? false,
    mainSync: raw?.mainSync ?? 'pr',
    onConflict: raw?.onConflict ?? 'halt',
  };
  // Validated for the same startup-failure reason as the branch names: a typo here ('direct', 'push',
  // 'PR') would otherwise silently fall through to whichever mode the executor's comparison happens to
  // miss, and the difference between the two modes is whether the default branch gets written.
  if (resolved.mainSync !== 'pr' && resolved.mainSync !== 'direct-push') {
    throw new BitError(
      `sync.mainSync: "${resolved.mainSync}" is not a valid value. Use "pr" (propose the main-scope drift ` +
        `as a pull request from sync.mainSyncBranch) or "direct-push" (push the drift straight onto the ` +
        `default branch)`
    );
  }
  // Same startup-failure idiom as mainSync: this key decides whether a conflicted merge halts for a
  // human or silently picks a side, so a typo ('git', 'ours', 'lane') must not fall through to any
  // behaviour at all — least of all to the two values that rewrite one side's work without asking.
  if (resolved.onConflict !== 'halt' && resolved.onConflict !== 'git-wins' && resolved.onConflict !== 'lane-wins') {
    throw new BitError(
      `sync.onConflict: "${resolved.onConflict}" is not a valid value. Use "halt" (stop the conflicted ` +
        `lane, label the PR and let a human resolve — the default), "git-wins" (conflicting hunks keep ` +
        `the branch's version) or "lane-wins" (conflicting hunks take the lane's version)`
    );
  }
  assertValidBranchPrefix(resolved.branchPrefix, 'sync.branchPrefix');
  assertValidBranchName(resolved.mainSyncBranch, 'sync.mainSyncBranch');
  Object.entries(resolved.branches).forEach(([laneName, branch]) =>
    assertValidBranchName(branch, `sync.branches["${laneName}"]`)
  );
  return resolved;
}

/**
 * The branch a lane name maps to. The derived result is validated too, not just the configured pieces: a
 * `branchPrefix` that is fine on its own can still combine with a lane name into something git refuses,
 * and this is the last point before the name is handed to a git command.
 */
export function laneNameToBranch(laneName: string, cfg: Required<CiSyncConfig>): string {
  const override = cfg.branches[laneName];
  if (override) return override; // already validated by resolveSyncConfig
  const derived = `${cfg.branchPrefix}${laneName}`;
  assertValidBranchName(derived, `the branch for lane "${laneName}" (sync.branchPrefix + lane name)`);
  return derived;
}

export function branchToLaneName(branch: string, cfg: Required<CiSyncConfig>): string | undefined {
  const override = Object.entries(cfg.branches).find(([, b]) => b === branch);
  if (override) return override[0];
  if (cfg.branchPrefix) {
    return branch.startsWith(cfg.branchPrefix) ? branch.slice(cfg.branchPrefix.length) : undefined;
  }
  return branch;
}

/**
 * A lane the reconciler was asked to sync, split into the two scope relations a lane actually has:
 * the scope that **hosts** the lane object (where it is read from and exported to) and the lane's
 * bare **name** (which is what maps to a branch).
 *
 * Keeping them apart is what lets a lane hosted on another scope be addressed at all. Note the
 * asymmetry, and it is deliberate: the branch mapping uses the NAME only — a lane is mirrored onto the
 * branch its name maps to, whichever scope hosts it — while every *bit* operation (reading the lane,
 * snapping, exporting, the id written into the sync commit subject) uses the full `hostScope/name`.
 */
export type LaneTarget = {
  /** the scope hosting the lane object; the workspace's defaultScope unless the target said otherwise */
  hostScope: string;
  /** the bare lane name — never contains a '/' */
  name: string;
};

/**
 * Parse the `[lane]` argument of `bit ci sync` into a {@link LaneTarget}.
 *
 * Two accepted forms:
 * - `my-lane` — a lane hosted on this workspace's `defaultScope` (the historical form);
 * - `some-org.some-scope/my-lane` — a lane hosted on another scope. A lane is an org-global change
 *   set, so the scope that hosts it need not be the scope this repository maps to.
 *
 * The split is unambiguous because a lane **name** cannot contain `/` (bit rejects it at creation),
 * so the single `/` in a scope-qualified id is always the boundary. A scope id is *usually*
 * `owner.scope`, but the dot is NOT required (self-hosted and test scopes are frequently bare names),
 * so it is not validated here — the remote answers "lane was not found" if the scope is wrong, which
 * is a far better error than a syntax rule that rejects legitimate ids.
 *
 * Anything else (`a/b/c`, `/x`, `x/`, blank) is refused rather than coerced: guessing at a malformed
 * target could silently reconcile the *wrong* lane onto a branch.
 */
export function parseLaneTarget(input: string, defaultScope: string): LaneTarget {
  const trimmed = input.trim();
  if (!trimmed) throw new BitError('bit ci sync: the lane argument is empty');
  if (!trimmed.includes('/')) return { hostScope: defaultScope, name: trimmed };
  const parts = trimmed.split('/');
  const [hostScope, name] = parts;
  if (parts.length !== 2 || !hostScope || !name) {
    throw new BitError(
      `bit ci sync: "${input}" is not a valid lane target. Use either a lane name ("my-lane", resolved ` +
        `against the workspace's defaultScope "${defaultScope}") or a scope-qualified lane id ` +
        `("some-org.some-scope/my-lane")`
    );
  }
  return { hostScope, name };
}

/**
 * The lane name a branch maps to, **only if that name could actually be a lane** — otherwise undefined.
 *
 * This is the pairing `--all`'s branch enumeration needs, and the two halves are not interchangeable:
 * `branchToLaneName` is a string transform (under the default `branchPrefix: ''` it is the identity), so
 * on its own it happily reports that `feature/foo` maps to the "lane" `feature/foo`. No lane can be called
 * that — bit forbids `/` in a lane name precisely because it is the `scope/lane` delimiter — so such a
 * branch cannot correspond to any lane and must not be queued as one.
 */
export function syncableLaneNameForBranch(branch: string, cfg: Required<CiSyncConfig>): string | undefined {
  const laneName = branchToLaneName(branch, cfg);
  return laneName && isValidLaneName(laneName) ? laneName : undefined;
}

/**
 * bit's own maximum lane-name length (`create-lane.ts`'s `MAX_LANE_NAME_LENGTH`).
 */
const MAX_LANE_NAME_LENGTH = 800;

/**
 * Could this string be a bit lane name at all?
 *
 * Mirrors `isValidLaneName` in `scopes/lanes/modules/create-lane/create-lane.ts` — the rule
 * `throwForInvalidLaneName` enforces when a lane is created: lowercase alphanumerics plus `- _ $ !`, and
 * **no `/`** (bit's own TODO there notes that allowing a slash would collide with the `scope/lane`
 * delimiter, which is exactly the collision this guards).
 *
 * Re-stated here rather than imported, deliberately. `isValidLaneName` is module-private — only the
 * throwing wrapper is exported — so using bit's copy would mean importing `create-lane` (a heavy module,
 * and a new aspect-level dependency edge) purely to run a regex, and then using exceptions as control
 * flow for something that is a *filter*. The drift risk is one-directional and safe: if bit ever loosened
 * the rule, this would skip a branch that could now be a lane, which shows up as "that lane never synced"
 * rather than as anything destructive. `sync-config.spec.ts` pins the rule so a divergence is visible.
 */
export function isValidLaneName(name: string): boolean {
  if (!name || name.length > MAX_LANE_NAME_LENGTH) return false;
  return /^[$\-_!a-z0-9]+$/.test(name);
}

/** minimal glob: '*' wildcard only (matches the lanes list use-case; avoids a new dep) */
function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

export function shouldSyncLane(laneName: string, cfg: Required<CiSyncConfig>): boolean {
  return cfg.lanes.some((pattern) => globToRegExp(pattern).test(laneName));
}
