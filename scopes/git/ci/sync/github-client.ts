export type PrInfo = { number: number; state: 'open' | 'closed'; labels: string[]; headRef: string; htmlUrl: string };

export function parseGitHubRepo(remoteUrl: string): string | undefined {
  const match = remoteUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
  return match?.[1];
}

const API = 'https://api.github.com';

export class GitHubClient {
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
    const repo = process.env.GITHUB_REPOSITORY || (gitRemoteUrl ? parseGitHubRepo(gitRemoteUrl) : undefined);
    if (!token || !repo) return undefined;
    return new GitHubClient({ token, repo });
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
