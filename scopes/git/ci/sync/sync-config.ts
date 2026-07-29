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

export function resolveSyncConfig(raw?: CiSyncConfig): Required<CiSyncConfig> {
  return {
    mode: raw?.mode ?? 'git-source-of-truth',
    branchPrefix: raw?.branchPrefix ?? '',
    branches: raw?.branches ?? {},
    lanes: raw?.lanes ?? ['*'],
    mainSyncBranch: raw?.mainSyncBranch ?? 'bit-sync/main',
    autoMergeMainSyncPr: raw?.autoMergeMainSyncPr ?? false,
  };
}

export function laneNameToBranch(laneName: string, cfg: Required<CiSyncConfig>): string {
  return cfg.branches[laneName] ?? `${cfg.branchPrefix}${laneName}`;
}

export function branchToLaneName(branch: string, cfg: Required<CiSyncConfig>): string | undefined {
  const override = Object.entries(cfg.branches).find(([, b]) => b === branch);
  if (override) return override[0];
  if (cfg.branchPrefix) {
    return branch.startsWith(cfg.branchPrefix) ? branch.slice(cfg.branchPrefix.length) : undefined;
  }
  return branch;
}

/** minimal glob: '*' wildcard only (matches the lanes list use-case; avoids a new dep) */
function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

export function shouldSyncLane(laneName: string, cfg: Required<CiSyncConfig>): boolean {
  return cfg.lanes.some((pattern) => globToRegExp(pattern).test(laneName));
}
