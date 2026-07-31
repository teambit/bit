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
   * How main-scope drift reaches the default branch: 'pr' (default) via `mainSyncBranch` + a PR;
   * 'direct-push' commits straight onto the default branch (`mainSyncBranch` unused).
   */
  mainSync?: 'pr' | 'direct-push';
  /**
   * What `merge-diverged` does on a genuine conflict: 'halt' (default) labels the PR and leaves it to
   * a human; 'git-wins'/'lane-wins' resolve conflicting hunks to that side. Non-conflicting hunks
   * always merge regardless of policy.
   */
  onConflict?: 'halt' | 'git-wins' | 'lane-wins';
  /** enable GitHub auto-merge on the main sync PR */
  autoMergeMainSyncPr?: boolean;
}

/**
 * Resolve the configured sync options, validating every branch name before anything runs — a bad name
 * must fail at startup naming the config key, not mid-run with git's own ref error.
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
  // Config comes from workspace.jsonc, so the union types are not enforced at runtime; a typo must
  // fail at startup rather than fall through to whichever mode a comparison happens to miss.
  if (resolved.mainSync !== 'pr' && resolved.mainSync !== 'direct-push') {
    throw new BitError(
      `sync.mainSync: "${resolved.mainSync}" is not a valid value. Use "pr" (propose the main-scope drift ` +
        `as a pull request from sync.mainSyncBranch) or "direct-push" (push the drift straight onto the ` +
        `default branch)`
    );
  }
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
 * The branch a lane name maps to. The derived result is validated too: a prefix that is fine on its
 * own can still combine with a lane name into something git refuses.
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
 * A lane to sync, split into the scope hosting the lane object and the bare name. The branch mapping
 * uses the NAME only; every bit operation uses the full `hostScope/name`.
 */
export type LaneTarget = {
  /** the scope hosting the lane object; the workspace's defaultScope unless the target said otherwise */
  hostScope: string;
  /** the bare lane name — never contains a '/' */
  name: string;
};

/**
 * Parse the `[lane]` argument (`my-lane` or `some-org.some-scope/my-lane`) into a {@link LaneTarget}.
 * A lane name cannot contain `/`, so the single `/` is always the scope/name boundary. The dot in a
 * scope id is not required (self-hosted scopes can be bare names), so it is not validated here.
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
 * The lane name a branch maps to, only if that name could actually be a lane. `branchToLaneName` alone
 * is a string transform (the identity under the default empty prefix), so it would report `feature/foo`
 * as a "lane" — a name bit forbids.
 */
export function syncableLaneNameForBranch(branch: string, cfg: Required<CiSyncConfig>): string | undefined {
  const laneName = branchToLaneName(branch, cfg);
  return laneName && isValidLaneName(laneName) ? laneName : undefined;
}

/** bit's own maximum lane-name length (`create-lane.ts`'s `MAX_LANE_NAME_LENGTH`). */
const MAX_LANE_NAME_LENGTH = 800;

/**
 * Could this string be a bit lane name at all? Mirrors the module-private `isValidLaneName` in
 * `create-lane.ts`; drift errs toward skipping a branch, and `sync-config.spec.ts` pins the rule.
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
