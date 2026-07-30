import type { GitHostProvider, PrInfo } from './git-host-provider';

export function parseGitHubRepo(remoteUrl: string): string | undefined {
  const match = remoteUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
  return match?.[1];
}

/**
 * The host a git remote URL points at, lower-cased, or undefined when the URL has no authority (a local
 * path, a `file://` URL).
 *
 * Matches the authority component of every remote form git accepts and nothing else: an optional scheme
 * (`https://`, `ssh://`, `git+ssh://`), optional `user@` credentials, then the host up to the first `:`
 * (port, or the scp-like path separator in `git@github.com:owner/repo`) or `/`.
 */
function remoteHost(remoteUrl: string): string | undefined {
  return remoteUrl
    .trim()
    .match(/^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^:/]+)/i)?.[1]
    ?.toLowerCase();
}

/**
 * Does this remote point at GitHub? A *host* test and nothing more: `matchesRemote` answers "whose host
 * is this", while resolving the `owner/repo` is `isConfigured`'s job — a github.com remote we can't parse
 * is still GitHub's to claim, and must not fall through to another provider.
 *
 * The host is parsed out and compared for equality rather than searched for in the URL, because
 * `github.com` is a perfectly ordinary *path* segment on another host: a substring test claims
 * `https://gitlab.example.com/mirrors/github.com/acme/repo.git` for GitHub, and this provider then
 * exclusively owns a remote it cannot talk to — every PR operation for that repository is either skipped
 * or, with a token in the environment, aimed at api.github.com for a repository that lives elsewhere.
 */
export function isGitHubRemote(remoteUrl: string): boolean {
  return remoteHost(remoteUrl) === 'github.com';
}

const API = 'https://api.github.com';

export class GitHubClient implements GitHostProvider {
  readonly name = 'github';

  private token: string;
  private repo: string;
  private fetchImpl: typeof fetch;

  constructor(opts: { token: string; repo: string; fetchImpl?: typeof fetch }) {
    this.token = opts.token;
    this.repo = opts.repo;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  static fromEnv(gitRemoteUrl?: string): GitHubClient | undefined {
    const token = process.env.GITHUB_TOKEN || process.env.BIT_GITHUB_TOKEN;
    // The remote is only allowed to name the repository once it is established to *be* a github.com
    // remote. `parseGitHubRepo` is unanchored (it searches for `github.com/<owner>/<repo>` anywhere in
    // the string), so without this guard `https://mygithub.com/acme/shop` would yield `acme/shop` and
    // mint a client pointed at api.github.com for a repository on an entirely different host.
    // A remote we can see and that is demonstrably NOT github's is a hard no, whatever the environment
    // says. `GITHUB_REPOSITORY` is set for every job on GitHub Actions, including ones whose `origin` is
    // a GitLab/Bitbucket mirror — without this, such a run mints a client for the env var's repository
    // and aims this repository's pull requests at a completely different one.
    if (gitRemoteUrl && !isGitHubRemote(gitRemoteUrl)) return undefined;
    const repoFromRemote = gitRemoteUrl ? parseGitHubRepo(gitRemoteUrl) : undefined;
    const repo = process.env.GITHUB_REPOSITORY || repoFromRemote;
    if (!token || !repo) return undefined;
    return new GitHubClient({ token, repo });
  }

  matchesRemote(remoteUrl: string): boolean {
    return isGitHubRemote(remoteUrl);
  }

  /** A constructed client always has both halves — it cannot be built without them. */
  isConfigured(): boolean {
    return Boolean(this.token && this.repo);
  }

  private async request(method: string, path: string, body?: unknown): Promise<any> {
    const res = await this.fetchImpl(`${API}/repos/${this.repo}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GitHub API ${method} ${path} failed: ${res.status} ${text}`);
    }
    return res.status === 204 ? undefined : res.json();
  }

  private toPrInfo(raw: any): PrInfo {
    return {
      number: raw.number,
      state: raw.state,
      labels: (raw.labels ?? []).map((l: any) => (typeof l === 'string' ? l : l.name)),
      headRef: raw.head?.ref,
      htmlUrl: raw.html_url,
    };
  }

  async findPrByBranch(branch: string): Promise<PrInfo | undefined> {
    const owner = this.repo.split('/')[0];
    const list = await this.request('GET', `/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`);
    return list.length ? this.toPrInfo(list[0]) : undefined;
  }

  async createPr(opts: { head: string; base: string; title: string; body: string }): Promise<PrInfo> {
    return this.toPrInfo(await this.request('POST', '/pulls', opts));
  }

  async closePr(prNumber: number, comment?: string): Promise<void> {
    if (comment) await this.comment(prNumber, comment);
    await this.request('PATCH', `/pulls/${prNumber}`, { state: 'closed' });
  }

  async comment(prNumber: number, body: string): Promise<void> {
    await this.request('POST', `/issues/${prNumber}/comments`, { body });
  }

  async addLabel(prNumber: number, label: string): Promise<void> {
    await this.request('POST', `/issues/${prNumber}/labels`, { labels: [label] });
  }
}

/**
 * The registrable GitHub provider: a `GitHostProvider` that resolves its `GitHubClient` from the
 * environment lazily, on first use.
 *
 * Registration happens when the ci aspect loads — long before anyone knows whether this run has a
 * token, or what `origin` points at. So the registered object cannot *be* a `GitHubClient`
 * (`fromEnv` returns undefined without credentials, and there'd be nothing to register). Instead it's
 * this shell: always registrable, never throws at registration time, and simply reports
 * `isConfigured() === false` when the credentials aren't there — which the engine reads as PR-less
 * sync.
 *
 * A successfully resolved client is memoized — `fromEnv` is a pure function of `process.env` plus the
 * remote URL, both fixed for the life of a command — while an unresolved one is retried, so a later
 * call that *does* carry the remote URL can still succeed. That keeps `isConfigured` cheap and
 * idempotent, which the interface requires of it.
 */
export class GitHubHostProvider implements GitHostProvider {
  readonly name = 'github';

  private client: GitHubClient | undefined;

  /**
   * The last `origin` URL this provider was asked about, remembered so a PR method can still recover
   * `owner/repo` from it. Both interface methods that receive the remote record it, because either can
   * be the first (or only) one the engine calls.
   */
  private remoteHint: string | undefined;

  matchesRemote(remoteUrl: string): boolean {
    const matches = isGitHubRemote(remoteUrl);
    // Only remember a remote that is actually ours. The hint is what `resolveClient` falls back to when a
    // PR method is called without one, so remembering a GitLab URL here would let it be combined with
    // `GITHUB_REPOSITORY` later and produce a client for the wrong repository.
    if (matches) this.remoteHint = remoteUrl;
    return matches;
  }

  /**
   * **A known non-GitHub remote can never count as configured**, however complete the environment looks.
   *
   * This is not the same question as `matchesRemote`, and the difference is where the bug was.
   * `selectGitHostProvider` only consults claimants when *someone* claims the remote; when nobody does —
   * a GitLab origin, a self-hosted host, an `insteadOf` rewrite — it falls back to "the sole configured
   * provider". On GitHub Actions `GITHUB_TOKEN` and `GITHUB_REPOSITORY` are both set for every job, so
   * this provider answered "configured" for a repository it had just declined to claim, became the sole
   * candidate, and the run created pull requests on the wrong host's repository.
   *
   * With no URL at all the behaviour is unchanged: nothing has been established about the remote, and the
   * sole-configured fallback is exactly what should apply.
   */
  isConfigured(remoteUrl?: string): boolean {
    if (remoteUrl && !isGitHubRemote(remoteUrl)) return false;
    if (remoteUrl) this.remoteHint = remoteUrl;
    return Boolean(this.resolveClient(remoteUrl));
  }

  async findPrByBranch(branch: string): Promise<PrInfo | undefined> {
    return this.requireClient().findPrByBranch(branch);
  }

  async createPr(opts: { head: string; base: string; title: string; body: string }): Promise<PrInfo> {
    return this.requireClient().createPr(opts);
  }

  async closePr(prNumber: number, comment?: string): Promise<void> {
    return this.requireClient().closePr(prNumber, comment);
  }

  async comment(prNumber: number, body: string): Promise<void> {
    return this.requireClient().comment(prNumber, body);
  }

  async addLabel(prNumber: number, label: string): Promise<void> {
    return this.requireClient().addLabel(prNumber, label);
  }

  /**
   * The remote URL is how `owner/repo` is recovered when `GITHUB_REPOSITORY` isn't set (any CI that
   * isn't GitHub Actions). Selection normally supplies it via `isConfigured` before any PR method runs,
   * but a consumer holding this provider directly may not — so fall back to the remembered hint rather
   * than silently losing the origin-parse path and reporting "not configured".
   */
  private resolveClient(remoteUrl?: string): GitHubClient | undefined {
    if (!this.client) this.client = GitHubClient.fromEnv(remoteUrl ?? this.remoteHint);
    return this.client;
  }

  private requireClient(): GitHubClient {
    const client = this.resolveClient();
    if (!client) {
      throw new Error(
        `the github host provider is not configured: set GITHUB_TOKEN or BIT_GITHUB_TOKEN, and either ` +
          `GITHUB_REPOSITORY or a github.com "origin" remote`
      );
    }
    return client;
  }
}
