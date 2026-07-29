import type { GitHostProvider, PrInfo } from './git-host-provider';

// `PrInfo` is the git-host contract's type, not GitHub's — it lives in `git-host-provider.ts` so the
// interface doesn't depend on one of its implementations. Re-exported here because every existing
// consumer imports it from this module.
export type { PrInfo };

export function parseGitHubRepo(remoteUrl: string): string | undefined {
  const match = remoteUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
  return match?.[1];
}

/**
 * Does this remote point at GitHub? Deliberately the *host* half of `parseGitHubRepo`'s pattern and
 * nothing more: `matchesRemote` answers "whose host is this", while resolving the `owner/repo` is
 * `isConfigured`'s job — a github.com remote we can't parse is still GitHub's to claim, and must not
 * fall through to another provider.
 */
export function isGitHubRemote(remoteUrl: string): boolean {
  return /(^|[@/.])github\.com[:/]/.test(remoteUrl);
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
    const repoFromRemote = gitRemoteUrl && isGitHubRemote(gitRemoteUrl) ? parseGitHubRepo(gitRemoteUrl) : undefined;
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
    this.remoteHint = remoteUrl;
    return isGitHubRemote(remoteUrl);
  }

  isConfigured(remoteUrl?: string): boolean {
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
