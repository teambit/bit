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
  };
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

/** minimal glob: '*' wildcard only (matches the lanes list use-case; avoids a new dep) */
function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

export function shouldSyncLane(laneName: string, cfg: Required<CiSyncConfig>): boolean {
  return cfg.lanes.some((pattern) => globToRegExp(pattern).test(laneName));
}
