import { BitError } from '@teambit/bit-error';

/**
 * Is this a branch name git will accept? A conservative pure subset of `git check-ref-format --branch`:
 * stricter than git is fine, laxer is not. A leading `-` must be refused here because it would be read
 * as a command-line option once interpolated into a git invocation.
 */
export function isValidGitBranchName(name: string): boolean {
  return validateBranchName(name) === undefined;
}

/** Why `name` is not a usable branch name, or undefined when it is. */
export function validateBranchName(name: string): string | undefined {
  if (!name) return 'it is empty';
  if (name.startsWith('-')) return 'it starts with "-", which git would read as a command-line option';
  if (/\s/.test(name)) return 'it contains whitespace';
  // oxlint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(name)) return 'it contains a control character';
  if (/[~^:?*[\\]/.test(name)) return 'it contains one of the characters git forbids in a ref: ~ ^ : ? * [ \\';
  if (name.includes('..')) return 'it contains ".."';
  if (name.includes('@{')) return 'it contains "@{"';
  if (name === '@') return 'it is "@", which git reserves';
  // Leading `refs/` only: pushes interpolate the name into `refs/heads/<b>`, so it would double up.
  if (name.startsWith('refs/'))
    return 'it starts with "refs/" — configure the bare branch name ("main", not "refs/heads/main")';
  if (name.startsWith('/') || name.endsWith('/')) return 'it starts or ends with "/"';
  if (name.includes('//')) return 'it contains an empty path component ("//")';
  if (name.endsWith('.')) return 'it ends with "."';
  if (name.endsWith('.lock')) return 'it ends with ".lock"';
  if (name.split('/').some((component) => component.startsWith('.'))) return 'a path component starts with "."';
  if (name.split('/').some((component) => component.endsWith('.lock'))) return 'a path component ends with ".lock"';
  return undefined;
}

/** Throw a `BitError` naming the offending config key and value unless `name` is a usable branch name. */
export function assertValidBranchName(name: string, configKey: string): void {
  const problem = validateBranchName(name);
  if (!problem) return;
  throw new BitError(
    `bit ci sync: ${configKey} is "${name}", which is not a valid git branch name — ${problem}. ` +
      `Fix it in the "teambit.git/ci" sync config in workspace.jsonc.`
  );
}

/**
 * A `branchPrefix` may end in `/` or be empty, so it is validated as the *start* of a branch name.
 * The full check still happens on the derived name (see `laneNameToBranch`).
 */
export function assertValidBranchPrefix(prefix: string, configKey: string): void {
  if (!prefix) return;
  const problem = validateBranchName(`${prefix}x`);
  if (!problem) return;
  throw new BitError(
    `bit ci sync: ${configKey} is "${prefix}", which cannot start a valid git branch name — ${problem}. ` +
      `Fix it in the "teambit.git/ci" sync config in workspace.jsonc.`
  );
}

export interface CiSyncConfig {
  /** The prefix for a lane-mapped branch. 'lane/' maps lane my-lane to branch lane/my-lane. */
  branchPrefix?: string;
  /** Explicit overrides that map a lane name to a branch name. */
  branches?: Record<string, string>;
  /** The glob patterns of the lane names to sync. An empty list stops lane mirroring. */
  lanes?: string[];
  /** The branch that carries the main-scope drift. */
  mainSyncBranch?: string;
  /**
   * How main-scope drift reaches the default branch. 'pr' (the default): the command commits the drift
   * to `mainSyncBranch` and opens a pull request. 'direct-push': the command commits the drift on the
   * default branch and pushes it, and does not use `mainSyncBranch`.
   */
  mainSync?: 'pr' | 'direct-push';
  /**
   * What the command does with one contested line during a `merge-diverged` action. 'halt' (the
   * default): the command stops, labels the pull request, and writes the recovery steps. 'git-wins':
   * the command keeps the branch version. 'lane-wins': the command takes the lane version.
   * Non-conflicting changes always merge, with every value.
   */
  onConflict?: 'halt' | 'git-wins' | 'lane-wins';
  /** Reserved. The command warns and enables no auto-merge on the main sync pull request. */
  autoMergeMainSyncPr?: boolean;
}

/**
 * Resolve the configured sync options, validating every branch name before anything runs — a bad name
 * must fail at startup naming the config key, not mid-run with git's own ref error.
 */
export function resolveSyncConfig(raw?: CiSyncConfig): Required<CiSyncConfig> {
  const resolved: Required<CiSyncConfig> = {
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
 * The lane name a branch maps to, only if that name could actually be a lane AND maps back to a branch
 * name usable in a git invocation. `branchToLaneName` alone is a string transform (the identity under
 * the default empty prefix), so it would report `feature/foo` as a "lane" — a name bit forbids. The
 * round trip matters because the lane grammar permits `-`: a developer branch called `-x` is a valid
 * lane name, so enumeration would adopt it as a target and the branch mapping would then throw, turning
 * one oddly-named branch into a halt that fails the whole `--all` run. Such a branch is not lane-mapped;
 * skip it like any other.
 */
export function syncableLaneNameForBranch(branch: string, cfg: Required<CiSyncConfig>): string | undefined {
  const laneName = branchToLaneName(branch, cfg);
  if (!laneName || !isValidLaneName(laneName)) return undefined;
  // `laneNameToBranch` asserts rather than returns, so the round trip is checked here: a configured
  // override is already validated, and a derived name must pass the same branch-name rules.
  if (cfg.branches[laneName]) return laneName;
  return validateBranchName(`${cfg.branchPrefix}${laneName}`) === undefined ? laneName : undefined;
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
