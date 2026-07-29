/**
 * The git-host contract `bit ci sync` is written against.
 *
 * The sync engine (both executors) reconciles Bit lanes with git branches and *pull requests*. The git
 * half is plain git — every host speaks it — but the pull-request half is host-specific API surface.
 * This interface is that half, and nothing in the engine may reach past it: GitHub is one
 * implementation (`GitHubClient`, shipped built-in and registered by the ci aspect itself), and a
 * GitLab/Bitbucket/Gitea aspect can add its own by calling `ci.registerGitHostProvider(...)` — the
 * same shape as a package manager registering into the dependency-resolver's slot.
 *
 * Every method here is the *whole* PR vocabulary of the engine. Adding to it is a breaking change for
 * out-of-tree providers, so prefer expressing new behaviour in terms of these primitives.
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

  /**
   * Does this provider serve the repository at `remoteUrl` (the `origin` remote)? A host test, not a
   * credentials test — see `isConfigured`.
   */
  matchesRemote(remoteUrl: string): boolean;

  /**
   * Can this provider actually talk to its API right now — token *and* repository resolvable?
   *
   * `remoteUrl` is passed by `selectGitHostProvider` because for some hosts the repository is derived
   * from the remote when the environment doesn't name it (GitHub: `GITHUB_REPOSITORY` if set,
   * otherwise parsed from `origin`). Providers that resolve everything from the environment ignore it.
   *
   * Must not throw: an unconfigured provider is a normal, expected state — the engine degrades to
   * PR-less (git-only) sync and says which credentials were missing. Keep it **cheap and idempotent**:
   * selection may call it more than once per run (once per candidate pass), and it must never perform
   * network I/O — memoize whatever resolution it does, as `GitHubHostProvider` does.
   */
  isConfigured(remoteUrl?: string): boolean;

  findPrByBranch(branch: string): Promise<PrInfo | undefined>;

  createPr(opts: { head: string; base: string; title: string; body: string }): Promise<PrInfo>;

  closePr(prNumber: number, comment?: string): Promise<void>;

  comment(prNumber: number, body: string): Promise<void>;

  addLabel(prNumber: number, label: string): Promise<void>;
}

/**
 * The outcome of `selectGitHostProvider`: the git host to use this run, or nothing plus a
 * log-friendly explanation of why PR operations are being skipped.
 */
export type GitHostSelection = {
  /** The host to use. undefined => PR-less (git-only) sync. */
  provider?: GitHostProvider;
  /**
   * Why no provider was selected — set exactly when `provider` is undefined, and phrased for a
   * one-line console warning. The caller surfaces it once per run so "no PRs this time" is never a
   * silent outcome.
   */
  reason?: string;
};

/**
 * Pick the provider that serves `remoteUrl`, or nothing (PR-less sync) plus the reason why.
 *
 * Pure and synchronous on purpose — it is the one place the "which host is this?" decision lives, so
 * it has to be testable without a network, a git repo, or a workspace.
 *
 * 1. **A claim is exclusive.** If *any* registered provider claims the remote (`matchesRemote`), the
 *    answer can only be one of the claimants — the first that is also configured, or nothing at all.
 *    Configuration never overrides a claim: routing a GitHub repository's pull requests to a GitLab
 *    provider merely because that one happens to hold a token would create, close and comment on the
 *    wrong host's PRs. So a claimed-but-unconfigured remote degrades to PR-less sync, naming the
 *    provider that claimed it. Among claimants, registration order breaks ties — exactly like the
 *    dependency-resolver's package-manager slot.
 * 2. **Sole configured provider is the fallback — only when nobody claims.** With no remote URL (no
 *    `origin`, or reading it failed) or a remote no provider claims (a self-hosted GitLab on a custom
 *    domain, a mirror, an `insteadOf` rewrite), one configured provider is unambiguous: use it rather
 *    than silently dropping to PR-less sync. Two or more in that situation are ambiguous, and guessing
 *    between them could comment on the wrong host's PR.
 * 3. **Otherwise nothing**, which every caller treats as "no PR operations this run".
 *
 * Together, 1 and 2 are what make the documented guarantee true: registering a provider cannot change
 * how a repository *another* provider claims is handled.
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
