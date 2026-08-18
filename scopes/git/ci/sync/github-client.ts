import type { GitHostProvider, PrInfo } from './git-host-provider';

/**
 * The `owner/repo` out of a github.com remote URL, anchored to the URL authority. `:digits` is a port
 * only under a scheme; in the scp-like form (`git@github.com:12345/repo`) the colon starts the PATH
 * and an all-digits owner is a legal GitHub username.
 */
export function parseGitHubRepo(remoteUrl: string): string | undefined {
  const url = remoteUrl.trim();
  const hasScheme = /^[a-z+]+:\/\//i.test(url);
  const match = hasScheme
    ? url.match(/(?:\/\/|@)github\.com(?::\d+)?\/([^/]+\/[^/]+?)(?:\.git)?$/i)
    : url.match(/(?:^|@)github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/i);
  return match?.[1];
}

/** The host a git remote URL points at, lower-cased, or undefined when the URL has no authority. */
function remoteHost(remoteUrl: string): string | undefined {
  return remoteUrl
    .trim()
    .match(/^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^:/]+)/i)?.[1]
    ?.toLowerCase();
}

/**
 * Does this remote point at GitHub? A host test only — an unparseable github.com remote is still
 * GitHub's to claim. Host equality, not substring: `github.com` can be a path segment on another host.
 */
export function isGitHubRemote(remoteUrl: string): boolean {
  return remoteHost(remoteUrl) === 'github.com';
}

const API = 'https://api.github.com';

/**
 * The `rel="next"` URL out of a GitHub `Link` response header, or undefined on the last page. The
 * header is response data, and `requestRaw` attaches the bearer token to whatever URL it is handed —
 * so a next link whose origin is not the API's reads as "last page", never as a request target.
 */
function nextPageUrl(linkHeader: string | null): string | undefined {
  if (!linkHeader) return undefined;
  const next = linkHeader.split(',').find((part) => part.includes('rel="next"'));
  const url = next?.match(/<([^>]+)>/)?.[1];
  if (!url) return undefined;
  try {
    return new URL(url).origin === API ? url : undefined;
  } catch {
    return undefined;
  }
}

/** Warning sink; a plain callback rather than a `Logger` so this module needs no logger aspect. */
export type WarnFn = (message: string) => void;

const noopWarn: WarnFn = () => {};

export class GitHubClient implements GitHostProvider {
  readonly name = 'github';

  private token: string;
  /** `owner/repo`. Readable so callers (and tests) can see *which* repository a resolved client speaks to. */
  readonly repo: string;
  private fetchImpl: typeof fetch;

  constructor(opts: { token: string; repo: string; fetchImpl?: typeof fetch }) {
    this.token = opts.token;
    this.repo = opts.repo;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /**
   * The client this environment describes, or undefined when it describes none. `origin` outranks
   * `GITHUB_REPOSITORY`: every PR operation names a branch that only exists on `origin`, so if the two
   * disagree the origin-parsed repository wins and the mismatch is warned about once.
   */
  static fromEnv(gitRemoteUrl?: string, warn: WarnFn = noopWarn): GitHubClient | undefined {
    // BIT_GITHUB_TOKEN is the override; GITHUB_TOKEN is the ambient default Actions injects everywhere.
    const token = process.env.BIT_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
    // A remote that is demonstrably not GitHub's is a hard no, whatever the environment says —
    // GITHUB_REPOSITORY is set on every Actions job, including ones whose origin is another host.
    if (gitRemoteUrl && !isGitHubRemote(gitRemoteUrl)) return undefined;
    const repoFromRemote = gitRemoteUrl ? parseGitHubRepo(gitRemoteUrl) : undefined;
    const repoFromEnv = process.env.GITHUB_REPOSITORY;
    const repo = repoFromRemote || repoFromEnv;
    if (!token || !repo) return undefined;
    // GitHub owner/repo names are case-insensitive.
    if (repoFromRemote && repoFromEnv && repoFromRemote.toLowerCase() !== repoFromEnv.toLowerCase()) {
      warn(
        `bit ci sync: GITHUB_REPOSITORY is "${repoFromEnv}" but the "origin" remote points at ` +
          `"${repoFromRemote}" — using "${repoFromRemote}", the repository this run pushes its branches to.`
      );
    }
    return new GitHubClient({ token, repo });
  }

  matchesRemote(remoteUrl: string): boolean {
    return isGitHubRemote(remoteUrl);
  }

  /** A constructed client always has both halves — it cannot be built without them. */
  isConfigured(): boolean {
    return Boolean(this.token && this.repo);
  }

  /** `pathOrUrl` may be a path relative to this repo, or an absolute URL (a `Link` header's next page). */
  private async requestRaw(method: string, pathOrUrl: string, body?: unknown): Promise<Response> {
    const url = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${API}/repos/${this.repo}${pathOrUrl}`;
    const res = await this.fetchImpl(url, {
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
      throw new Error(`GitHub API ${method} ${pathOrUrl} failed: ${res.status} ${text}`);
    }
    return res;
  }

  private async request(method: string, path: string, body?: unknown): Promise<any> {
    const res = await this.requestRaw(method, path, body);
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

  /**
   * The marker-bearing comment on the PR, `'absent'` when every page was searched, or `'unknown'`
   * when the defensive page cap cut the search short. GitHub defaults `per_page` to 30 and orders
   * ascending, and the maintained comment is posted once, early in a PR's life — so it lives in the
   * first pages and the search returns as soon as it is seen. `'unknown'` is distinct from `'absent'`
   * because running out of budget must not read as "not there": the caller would post a duplicate
   * report on every later push.
   */
  private async findMarkedComment(prNumber: number, marker: string): Promise<{ id: number } | 'absent' | 'unknown'> {
    let next: string | undefined = `/issues/${prNumber}/comments?per_page=100`;
    // Defensive cap: 20 pages (2,000 comments) is far past any real PR; without it a malformed or
    // adversarial `Link` header could loop this call forever.
    for (let page = 0; next && page < 20; page += 1) {
      const res: Response = await this.requestRaw('GET', next);
      const body = (await res.json()) as any[];
      const match = body.find((c: any) => (c.body ?? '').includes(marker));
      if (match) return { id: match.id };
      next = nextPageUrl(res.headers.get('link'));
    }
    return next ? 'unknown' : 'absent';
  }

  /**
   * Find the comment carrying `marker` (an HTML comment embedded in the body) and replace its body,
   * or post `body` as a new comment when none exists and `options.createIfAbsent` is not false.
   * GitHub's comment PATCH endpoint is `/issues/comments/{id}`, not `/issues/{pr}/comments/{id}` —
   * a comment id is unique per repository, not scoped under the issue/PR that carries it.
   *
   * Named to match `GitHostProvider.upsertComment` exactly (not e.g. `upsertIssueComment`): a
   * `GitHubClient` registered directly as a provider must satisfy the interface's optional method
   * under its real name, or callers that feature-test via `gitHost.upsertComment` would silently
   * treat a fully-capable client as unsupported.
   */
  async upsertComment(
    prNumber: number,
    marker: string,
    body: string,
    options: { createIfAbsent?: boolean } = {}
  ): Promise<void> {
    const existing = await this.findMarkedComment(prNumber, marker);
    if (existing === 'unknown') {
      // Surfaces through the caller's warn-and-skip path; posting blind would duplicate the report.
      throw new Error(
        `PR #${prNumber} has too many comments to establish whether the "${marker}" comment already exists`
      );
    }
    if (existing !== 'absent') {
      await this.request('PATCH', `/issues/comments/${existing.id}`, { body });
      return;
    }
    if (options.createIfAbsent === false) return;
    await this.comment(prNumber, body);
  }
}

/**
 * The registrable GitHub provider: resolves its `GitHubClient` from the environment lazily, since
 * registration happens at aspect load, before credentials are known. A resolved client is memoized;
 * an unresolved one is retried so a later call that does carry the remote URL can still succeed.
 */
export class GitHubHostProvider implements GitHostProvider {
  readonly name = 'github';

  private client: GitHubClient | undefined;

  /** The last `origin` URL seen, so a PR method can still recover `owner/repo` from it. */
  private remoteHint: string | undefined;

  constructor(private onWarning: WarnFn = noopWarn) {}

  matchesRemote(remoteUrl: string): boolean {
    const matches = isGitHubRemote(remoteUrl);
    // Only remember a remote that is ours — a foreign hint could later pair with GITHUB_REPOSITORY
    // into a client for the wrong repository.
    if (matches) this.remoteHint = remoteUrl;
    return matches;
  }

  /**
   * A known non-GitHub remote can never count as configured, however complete the environment looks:
   * on Actions the env is always set, so answering "configured" for a remote this provider declined to
   * claim would make it the sole-configured fallback and aim PRs at the wrong host's repository.
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

  async upsertComment(
    prNumber: number,
    marker: string,
    body: string,
    options?: { createIfAbsent?: boolean }
  ): Promise<void> {
    return this.requireClient().upsertComment(prNumber, marker, body, options);
  }

  private resolveClient(remoteUrl?: string): GitHubClient | undefined {
    if (!this.client) this.client = GitHubClient.fromEnv(remoteUrl ?? this.remoteHint, this.onWarning);
    return this.client;
  }

  private requireClient(): GitHubClient {
    const client = this.resolveClient();
    if (!client) {
      throw new Error(
        `the github host provider is not configured: set BIT_GITHUB_TOKEN (or GITHUB_TOKEN), and either ` +
          `GITHUB_REPOSITORY or a github.com "origin" remote`
      );
    }
    return client;
  }
}
