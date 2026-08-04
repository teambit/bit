/**
 * The git-host (pull request) contract `bit ci sync` is written against; nothing in the engine may
 * reach past it. Other hosts register via `ci.registerGitHostProvider(...)`. Adding a method is a
 * breaking change for out-of-tree providers.
 */
export type PrInfo = {
  number: number;
  state: 'open' | 'closed';
  labels: string[];
  headRef: string;
  htmlUrl: string;
};

export interface GitHostProvider {
  /** Stable identifier, used in logs and to tell registered providers apart. E.g. `'github'`. */
  name: string;

  /** Does this provider serve the repository at `remoteUrl`? A host test, not a credentials test. */
  matchesRemote(remoteUrl: string): boolean;

  /**
   * Token and repository resolvable? Must not throw (unconfigured is a normal state — the engine
   * degrades to git-only sync), must be cheap and idempotent, and must never perform network I/O.
   */
  isConfigured(remoteUrl?: string): boolean;

  findPrByBranch(branch: string): Promise<PrInfo | undefined>;

  createPr(opts: { head: string; base: string; title: string; body: string }): Promise<PrInfo>;

  closePr(prNumber: number, comment?: string): Promise<void>;

  comment(prNumber: number, body: string): Promise<void>;

  addLabel(prNumber: number, label: string): Promise<void>;
}

/** The git host to use this run, or nothing plus the reason PR operations are being skipped. */
export type GitHostSelection = {
  /** The host to use. undefined => PR-less (git-only) sync. */
  provider?: GitHostProvider;
  /** Set exactly when `provider` is undefined; surfaced once per run so PR-less is never silent. */
  reason?: string;
};

/**
 * Pick the provider that serves `remoteUrl`, or nothing (PR-less sync) plus the reason why.
 * A claim is exclusive: configuration never overrides `matchesRemote`, because routing to whichever
 * provider holds a token would act on the wrong host's PRs. A sole configured provider is the fallback
 * only when no provider claims the remote; two or more unclaimed-but-configured is too ambiguous.
 */
export function selectGitHostProvider(providers: GitHostProvider[], remoteUrl: string | undefined): GitHostSelection {
  if (!providers.length) {
    return { reason: 'no git host provider is registered — skipping all pull request operations' };
  }

  const claimants = remoteUrl ? providers.filter((provider) => provider.matchesRemote(remoteUrl)) : [];
  if (claimants.length) {
    const configured = claimants.find((provider) => provider.isConfigured(remoteUrl));
    if (configured) return { provider: configured };
    return {
      reason:
        `the ${listNames(claimants)} git host provider${claimants.length > 1 ? 's' : ''} serve${
          claimants.length > 1 ? '' : 's'
        } this repository's "origin" remote but ${claimants.length > 1 ? 'none is' : 'is not'} configured ` +
        `(missing credentials or repository) — skipping all pull request operations. No other provider is ` +
        `used in its place: that would act on the wrong host.`,
    };
  }

  const configured = providers.filter((provider) => provider.isConfigured(remoteUrl));
  if (configured.length === 1) return { provider: configured[0] };
  if (configured.length > 1) {
    return {
      reason:
        `no git host provider claims this repository's "origin" remote, and ${configured.length} are ` +
        `configured (${listNames(configured)}) — too ambiguous to pick one, skipping all pull request operations`,
    };
  }
  return {
    reason:
      `no git host provider is configured${remoteUrl ? '' : ' (and the "origin" remote could not be read)'} — ` +
      `skipping all pull request operations`,
  };
}

function listNames(providers: GitHostProvider[]): string {
  return providers.map((provider) => `"${provider.name}"`).join(', ');
}
