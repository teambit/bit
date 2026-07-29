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
   * Must not throw: an unconfigured provider is a normal, expected state — the engine degrades to
   * PR-less (git-only) sync and says which credentials were missing.
   */
  isConfigured(remoteUrl?: string): boolean;

  findPrByBranch(branch: string): Promise<PrInfo | undefined>;

  createPr(opts: { head: string; base: string; title: string; body: string }): Promise<PrInfo>;

  closePr(prNumber: number, comment?: string): Promise<void>;

  comment(prNumber: number, body: string): Promise<void>;

  addLabel(prNumber: number, label: string): Promise<void>;
}

/**
 * Pick the provider that serves `remoteUrl`, or undefined for PR-less sync.
 *
 * Pure and synchronous on purpose — it is the one place the "which host is this?" decision lives, so
 * it has to be testable without a network, a git repo, or a workspace.
 *
 * 1. **Host match wins.** The first registered provider that both claims the remote and is configured
 *    is the answer. Registration order therefore breaks ties, exactly like the dependency-resolver's
 *    package-manager slot.
 * 2. **Sole configured provider is the fallback.** With no remote URL (no `origin`, or reading it
 *    failed) or a remote nobody claims (a self-hosted GitLab on a custom domain, a mirror, an
 *    `insteadOf` rewrite), one configured provider is unambiguous — use it rather than silently
 *    dropping to PR-less sync. Two or more configured providers in that situation are ambiguous, and
 *    guessing between them could comment on the wrong host's PR.
 * 3. **Otherwise undefined**, which every caller treats as "no PR operations this run".
 */
export function selectGitHostProvider(
  providers: GitHostProvider[],
  remoteUrl: string | undefined
): GitHostProvider | undefined {
  if (remoteUrl) {
    const matched = providers.find((provider) => provider.matchesRemote(remoteUrl) && provider.isConfigured(remoteUrl));
    if (matched) return matched;
  }
  const configured = providers.filter((provider) => provider.isConfigured(remoteUrl));
  return configured.length === 1 ? configured[0] : undefined;
}
