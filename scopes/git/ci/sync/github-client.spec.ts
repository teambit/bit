import { expect } from 'chai';
import { GitHubClient, isGitHubRemote, parseGitHubRepo } from './github-client';

describe('parseGitHubRepo', () => {
  it('parses ssh and https remote urls', () => {
    expect(parseGitHubRepo('git@github.com:acme/shop.git')).to.equal('acme/shop');
    expect(parseGitHubRepo('https://github.com/acme/shop.git')).to.equal('acme/shop');
    expect(parseGitHubRepo('https://github.com/acme/shop')).to.equal('acme/shop');
    expect(parseGitHubRepo('https://gitlab.com/acme/shop.git')).to.equal(undefined);
  });

  // A claimed remote the parse then fails on silently degrades the whole run to PR-less mode.
  it('parses what the claim test claims: mixed-case hosts and explicit ports', () => {
    expect(parseGitHubRepo('https://GitHub.com/acme/shop.git')).to.equal('acme/shop');
    expect(parseGitHubRepo('https://github.com:443/acme/shop.git')).to.equal('acme/shop');
    expect(parseGitHubRepo('ssh://git@github.com:22/acme/shop.git')).to.equal('acme/shop');
  });

  it('keeps an all-digits scp owner as the owner, never a port', () => {
    expect(parseGitHubRepo('git@github.com:12345/shop.git')).to.equal('12345/shop');
  });

  it('rejects github.com as a path segment of another host, in both URL forms', () => {
    expect(parseGitHubRepo('https://gitlab.example.com/mirrors/github.com/acme/repo.git')).to.equal(undefined);
    expect(parseGitHubRepo('git@gitlab.example.com:mirrors/github.com/acme/repo.git')).to.equal(undefined);
  });
});

describe('isGitHubRemote', () => {
  it('accepts every remote form git accepts for github.com', () => {
    expect(isGitHubRemote('git@github.com:acme/shop.git')).to.equal(true);
    expect(isGitHubRemote('ssh://git@github.com/acme/shop.git')).to.equal(true);
    expect(isGitHubRemote('https://github.com/acme/shop.git')).to.equal(true);
    // credentials in the URL, an explicit port, and a capitalized host are all still github.com
    expect(isGitHubRemote('https://x-access-token:tok@github.com/acme/shop.git')).to.equal(true);
    expect(isGitHubRemote('https://GitHub.com/acme/shop')).to.equal(true);
  });

  it('rejects another host that merely has "github.com" in its path', () => {
    expect(isGitHubRemote('https://gitlab.example.com/mirrors/github.com/acme/repo.git')).to.equal(false);
    expect(isGitHubRemote('git@gitlab.example.com:mirrors/github.com/acme/repo.git')).to.equal(false);
  });

  it('rejects a lookalike host and a non-github host', () => {
    expect(isGitHubRemote('https://mygithub.com/acme/shop')).to.equal(false);
    expect(isGitHubRemote('https://github.company.com/acme/shop')).to.equal(false);
    expect(isGitHubRemote('git@gitlab.com:acme/shop.git')).to.equal(false);
    expect(isGitHubRemote('/srv/git/github.com/acme/shop.git')).to.equal(false);
  });
});

describe('GitHubClient.fromEnv', () => {
  const envKeys = ['GITHUB_TOKEN', 'BIT_GITHUB_TOKEN', 'GITHUB_REPOSITORY'] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    envKeys.forEach((key) => {
      saved[key] = process.env[key];
      delete process.env[key];
    });
    process.env.GITHUB_TOKEN = 'tok';
  });

  afterEach(() => {
    envKeys.forEach((key) => {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    });
  });

  it('uses the agreed repository when the remote and the environment say the same thing', () => {
    process.env.GITHUB_REPOSITORY = 'acme/shop';
    expect(GitHubClient.fromEnv('git@github.com:acme/shop.git')?.repo).to.equal('acme/shop');
  });

  it('prefers the ORIGIN-parsed repository when the two disagree, and warns naming both', () => {
    process.env.GITHUB_REPOSITORY = 'other-org/other-repo';
    const warnings: string[] = [];
    const client = GitHubClient.fromEnv('git@github.com:acme/shop.git', (message) => warnings.push(message));
    expect(client?.repo).to.equal('acme/shop');
    expect(warnings).to.have.lengthOf(1);
    expect(warnings[0]).to.contain('other-org/other-repo');
    expect(warnings[0]).to.contain('acme/shop');
  });

  it('is silent when the two differ only in case — GitHub repository names are case-insensitive', () => {
    process.env.GITHUB_REPOSITORY = 'Acme/Shop';
    const warnings: string[] = [];
    const client = GitHubClient.fromEnv('git@github.com:acme/shop.git', (message) => warnings.push(message));
    expect(client?.repo).to.equal('acme/shop');
    expect(warnings).to.deep.equal([]);
  });

  it('falls back to the environment when there is no remote to parse', () => {
    process.env.GITHUB_REPOSITORY = 'acme/shop';
    expect(GitHubClient.fromEnv()?.repo).to.equal('acme/shop');
    // ...and when the remote is a github.com URL nothing can be parsed out of
    expect(GitHubClient.fromEnv('https://github.com/')?.repo).to.equal('acme/shop');
  });

  it('still refuses a remote that is demonstrably not github, however complete the environment looks', () => {
    process.env.GITHUB_REPOSITORY = 'acme/shop';
    expect(GitHubClient.fromEnv('https://gitlab.com/acme/shop.git')).to.equal(undefined);
    expect(GitHubClient.fromEnv('https://mygithub.com/acme/shop')).to.equal(undefined);
  });

  it('needs a token: a repository on its own configures nothing', () => {
    delete process.env.GITHUB_TOKEN;
    process.env.GITHUB_REPOSITORY = 'acme/shop';
    expect(GitHubClient.fromEnv('git@github.com:acme/shop.git')).to.equal(undefined);
  });

  // Asserted through the `authorization` header, so what is pinned is the token the client actually
  // sends. The fetch stub must be installed before `fromEnv` runs.
  describe('token precedence', () => {
    let realFetch: typeof fetch;
    let calls: Array<{ url: string; init: any }>;

    beforeEach(() => {
      realFetch = globalThis.fetch;
      calls = [];
      globalThis.fetch = (async (url: any, init: any) => {
        calls.push({ url: String(url), init });
        return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
      }) as typeof fetch;
    });

    afterEach(() => {
      globalThis.fetch = realFetch;
    });

    /** The token a client built from this environment puts on the wire. */
    async function sentToken(): Promise<string | undefined> {
      const client = GitHubClient.fromEnv('git@github.com:acme/shop.git');
      await client?.findPrByBranch('lane-x');
      return calls[0]?.init?.headers?.authorization;
    }

    it('prefers BIT_GITHUB_TOKEN when both are set — the override beats the ambient default', async () => {
      process.env.GITHUB_TOKEN = 'workflow-token';
      process.env.BIT_GITHUB_TOKEN = 'user-pat';
      expect(await sentToken()).to.equal('Bearer user-pat');
    });

    it('uses GITHUB_TOKEN when it is the only one set — the ordinary Actions job', async () => {
      process.env.GITHUB_TOKEN = 'workflow-token';
      expect(await sentToken()).to.equal('Bearer workflow-token');
    });

    it('uses BIT_GITHUB_TOKEN when it is the only one set — any CI that is not Actions', async () => {
      delete process.env.GITHUB_TOKEN;
      process.env.BIT_GITHUB_TOKEN = 'user-pat';
      expect(await sentToken()).to.equal('Bearer user-pat');
    });

    it('is not configured when neither is set, however complete the rest of the environment is', async () => {
      delete process.env.GITHUB_TOKEN;
      process.env.GITHUB_REPOSITORY = 'acme/shop';
      expect(GitHubClient.fromEnv('git@github.com:acme/shop.git')).to.equal(undefined);
      expect(calls).to.have.lengthOf(0);
    });

    it('falls through an EMPTY BIT_GITHUB_TOKEN to GITHUB_TOKEN', async () => {
      process.env.GITHUB_TOKEN = 'workflow-token';
      process.env.BIT_GITHUB_TOKEN = '';
      expect(await sentToken()).to.equal('Bearer workflow-token');
    });
  });
});

describe('GitHubClient', () => {
  it('createPr posts to the pulls endpoint with auth', async () => {
    const calls: Array<{ url: string; init: any }> = [];
    const fakeFetch = (async (url: any, init: any) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({ number: 7, state: 'open', labels: [], head: { ref: 'lane-x' }, html_url: 'http://pr/7' }),
        { status: 201, headers: { 'content-type': 'application/json' } }
      );
    }) as typeof fetch;
    const client = new GitHubClient({ token: 'tok', repo: 'acme/shop', fetchImpl: fakeFetch });
    const pr = await client.createPr({ head: 'lane-x', base: 'main', title: 't', body: 'b' });
    expect(pr.number).to.equal(7);
    expect(calls[0].url).to.equal('https://api.github.com/repos/acme/shop/pulls');
    expect(calls[0].init.method).to.equal('POST');
    expect(calls[0].init.headers.authorization).to.equal('Bearer tok');
    expect(JSON.parse(calls[0].init.body)).to.deep.equal({ head: 'lane-x', base: 'main', title: 't', body: 'b' });
  });

  it('findPrByBranch returns undefined on empty list', async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;
    const client = new GitHubClient({ token: 'tok', repo: 'acme/shop', fetchImpl: fakeFetch });
    expect(await client.findPrByBranch('lane-x')).to.equal(undefined);
  });
});
