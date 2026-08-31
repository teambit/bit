import { expect } from 'chai';
import { GitHubClient, isGitHubRemote, parseGitHubRepo } from './github-client';

/**
 * A claimed remote the parse then fails on silently degrades the whole run to PR-less mode, so the two
 * predicates are pinned over the same remote shapes: whatever `isGitHubRemote` claims must parse.
 */
const REMOTES: Array<[string, string | undefined, boolean]> = [
  // url, parseGitHubRepo, isGitHubRemote
  ['git@github.com:acme/shop.git', 'acme/shop', true],
  ['https://github.com/acme/shop.git', 'acme/shop', true],
  ['https://github.com/acme/shop', 'acme/shop', true],
  ['ssh://git@github.com/acme/shop.git', 'acme/shop', true],
  // mixed-case host, an explicit port, and credentials in the url are all still github.com
  ['https://GitHub.com/acme/shop.git', 'acme/shop', true],
  ['https://github.com:443/acme/shop.git', 'acme/shop', true],
  ['ssh://git@github.com:22/acme/shop.git', 'acme/shop', true],
  ['https://x-access-token:tok@github.com/acme/shop.git', 'acme/shop', true],
  // an all-digits scp owner is an owner, never a port
  ['git@github.com:12345/shop.git', '12345/shop', true],
  // another host that merely has "github.com" in its path, in both url forms
  ['https://gitlab.example.com/mirrors/github.com/acme/repo.git', undefined, false],
  ['git@gitlab.example.com:mirrors/github.com/acme/repo.git', undefined, false],
  // look-alike and unrelated hosts
  ['https://mygithub.com/acme/shop', undefined, false],
  ['https://github.company.com/acme/shop', undefined, false],
  ['git@gitlab.com:acme/shop.git', undefined, false],
  ['https://gitlab.com/acme/shop.git', undefined, false],
  ['/srv/git/github.com/acme/shop.git', undefined, false],
];

describe('parseGitHubRepo / isGitHubRemote', () => {
  it('agree on every remote form git accepts, and on every host that is not github.com', () => {
    REMOTES.forEach(([url, repo, isGitHub]) => {
      expect(parseGitHubRepo(url), url).to.equal(repo);
      expect(isGitHubRemote(url), url).to.equal(isGitHub);
    });
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

  const OURS = 'git@github.com:acme/shop.git';
  /** [case, GITHUB_REPOSITORY, remote, resolved repo, warning fragments]. */
  const RESOLUTION: Array<[string, string, string | undefined, string | undefined, string[]?]> = [
    ['the remote and the environment agree', 'acme/shop', OURS, 'acme/shop'],
    // the ORIGIN-parsed repository outranks GITHUB_REPOSITORY, and the disagreement must be reported
    ['they disagree', 'other-org/other-repo', OURS, 'acme/shop', ['other-org/other-repo', 'acme/shop']],
    // GitHub repository names are case-insensitive, so a case-only difference is not a disagreement
    ['they differ only in case', 'Acme/Shop', OURS, 'acme/shop'],
    ['there is no remote to parse', 'acme/shop', undefined, 'acme/shop'],
    ['the remote is a github url nothing parses out of', 'acme/shop', 'https://github.com/', 'acme/shop'],
    // a remote that is demonstrably not github stays unconfigured however complete the environment is
    ['the remote is another host', 'acme/shop', 'https://gitlab.com/acme/shop.git', undefined],
    ['the remote is a look-alike host', 'acme/shop', 'https://mygithub.com/acme/shop', undefined],
  ];

  RESOLUTION.forEach(([name, repository, remote, repo, warns]) => {
    it(`resolves the repository when ${name}`, () => {
      process.env.GITHUB_REPOSITORY = repository;
      const warnings: string[] = [];
      const client = GitHubClient.fromEnv(remote, (message) => warnings.push(message));
      expect(client?.repo).to.equal(repo);
      (warns ?? []).forEach((fragment) => expect(warnings.join('\n')).to.contain(fragment));
      if (!warns) expect(warnings).to.deep.equal([]);
    });
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

    const PRECEDENCE: Array<[string, Record<string, string | undefined>, string]> = [
      // the override beats the ambient default
      ['both set', { GITHUB_TOKEN: 'workflow-token', BIT_GITHUB_TOKEN: 'user-pat' }, 'Bearer user-pat'],
      // the ordinary Actions job
      ['only GITHUB_TOKEN', { GITHUB_TOKEN: 'workflow-token' }, 'Bearer workflow-token'],
      // any CI that is not Actions
      ['only BIT_GITHUB_TOKEN', { BIT_GITHUB_TOKEN: 'user-pat' }, 'Bearer user-pat'],
      ['an EMPTY override', { GITHUB_TOKEN: 'workflow-token', BIT_GITHUB_TOKEN: '' }, 'Bearer workflow-token'],
    ];

    PRECEDENCE.forEach(([name, env, expected]) => {
      it(`sends the right token with ${name}`, async () => {
        delete process.env.GITHUB_TOKEN;
        Object.entries(env).forEach(([key, value]) => {
          process.env[key] = value;
        });
        expect(await sentToken()).to.equal(expected);
      });
    });

    it('is not configured when neither token is set, and puts nothing on the wire', async () => {
      delete process.env.GITHUB_TOKEN;
      process.env.GITHUB_REPOSITORY = 'acme/shop';
      expect(GitHubClient.fromEnv('git@github.com:acme/shop.git')).to.equal(undefined);
      expect(calls).to.have.lengthOf(0);
    });
  });
});

describe('GitHubClient', () => {
  it('createPr posts the pull-request payload to the pulls endpoint', async () => {
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

  describe('upsertComment', () => {
    // named `upsertComment`, matching `GitHostProvider.upsertComment` exactly — see the method's
    // own doc comment for why a differently-named method would be a silent-no-op trap.
    function fakeFetchOver(existingComments: Array<{ id: number; body: string }>) {
      const calls: Array<{ url: string; init: any }> = [];
      const fetchImpl = (async (url: any, init: any) => {
        calls.push({ url: String(url), init });
        const method = init?.method ?? 'GET';
        if (method === 'GET') {
          return new Response(JSON.stringify(existingComments), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
      }) as typeof fetch;
      return { calls, fetchImpl };
    }

    it('posts a new comment when no marked comment exists', async () => {
      const { calls, fetchImpl } = fakeFetchOver([]);
      const client = new GitHubClient({ token: 'tok', repo: 'acme/shop', fetchImpl });
      await client.upsertComment(7, '<!-- marker -->', '<!-- marker -->\nbody');
      const posts = calls.filter((c) => c.init?.method === 'POST');
      expect(posts).to.have.lengthOf(1);
      expect(posts[0].url).to.equal('https://api.github.com/repos/acme/shop/issues/7/comments');
    });

    it('patches the marked comment in place, and never posts a second one', async () => {
      const { calls, fetchImpl } = fakeFetchOver([
        { id: 42, body: 'unrelated comment' },
        { id: 99, body: '<!-- marker -->\nold report' },
      ]);
      const client = new GitHubClient({ token: 'tok', repo: 'acme/shop', fetchImpl });
      await client.upsertComment(7, '<!-- marker -->', '<!-- marker -->\nnew report');
      const patches = calls.filter((c) => c.init?.method === 'PATCH');
      expect(patches).to.have.lengthOf(1);
      expect(patches[0].url).to.equal('https://api.github.com/repos/acme/shop/issues/comments/99');
      expect(JSON.parse(patches[0].init.body)).to.deep.equal({ body: '<!-- marker -->\nnew report' });
      expect(calls.some((c) => c.init?.method === 'POST')).to.equal(false);
    });

    it('skips silently when createIfAbsent is false and no marked comment exists', async () => {
      const { calls, fetchImpl } = fakeFetchOver([]);
      const client = new GitHubClient({ token: 'tok', repo: 'acme/shop', fetchImpl });
      await client.upsertComment(7, '<!-- marker -->', 'cleared', { createIfAbsent: false });
      expect(calls.some((c) => c.init?.method === 'POST' || c.init?.method === 'PATCH')).to.equal(false);
    });

    it('lists at per_page=100 and follows Link-header pagination to find a comment past page 1', async () => {
      // GitHub defaults to per_page=30; a naive single-page list would miss this comment and post a
      // duplicate report on every push instead of updating it.
      const calls: Array<{ url: string; init: any }> = [];
      const fetchImpl = (async (url: any, init: any) => {
        calls.push({ url: String(url), init });
        const method = init?.method ?? 'GET';
        if (method === 'GET' && !String(url).includes('page=2')) {
          return new Response(JSON.stringify([{ id: 1, body: 'unrelated' }]), {
            status: 200,
            headers: {
              'content-type': 'application/json',
              link: '<https://api.github.com/repos/acme/shop/issues/7/comments?per_page=100&page=2>; rel="next"',
            },
          });
        }
        if (method === 'GET') {
          return new Response(JSON.stringify([{ id: 99, body: '<!-- marker -->\nold report' }]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
      }) as typeof fetch;
      const client = new GitHubClient({ token: 'tok', repo: 'acme/shop', fetchImpl });
      await client.upsertComment(7, '<!-- marker -->', '<!-- marker -->\nnew report');

      const gets = calls.filter((c) => (c.init?.method ?? 'GET') === 'GET');
      expect(gets).to.have.lengthOf(2);
      expect(gets[0].url).to.include('per_page=100');
      expect(gets[1].url).to.equal('https://api.github.com/repos/acme/shop/issues/7/comments?per_page=100&page=2');
      const patches = calls.filter((c) => c.init?.method === 'PATCH');
      expect(patches).to.have.lengthOf(1);
      expect(patches[0].url).to.equal('https://api.github.com/repos/acme/shop/issues/comments/99');
      // the found-on-page-2 comment was updated, not duplicated
      expect(calls.some((c) => c.init?.method === 'POST')).to.equal(false);
    });

    it('refuses to follow a Link header that leaves api.github.com — the token stays home', async () => {
      // The next-page URL is response data, and requestRaw attaches the bearer token to whatever URL
      // it is handed — an off-host "next" link must read as "last page", never as a request target.
      const calls: Array<{ url: string; init: any }> = [];
      const fetchImpl = (async (url: any, init: any) => {
        calls.push({ url: String(url), init });
        const method = init?.method ?? 'GET';
        if (method === 'GET') {
          return new Response(JSON.stringify([{ id: 1, body: 'unrelated' }]), {
            status: 200,
            headers: {
              'content-type': 'application/json',
              link: '<https://evil.test/repos/acme/shop/issues/7/comments?page=2>; rel="next"',
            },
          });
        }
        return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
      }) as typeof fetch;
      const client = new GitHubClient({ token: 'tok', repo: 'acme/shop', fetchImpl });
      await client.upsertComment(7, '<!-- marker -->', '<!-- marker -->\nbody');

      expect(calls.some((c) => c.url.includes('evil.test'))).to.equal(false);
      const gets = calls.filter((c) => (c.init?.method ?? 'GET') === 'GET');
      expect(gets, 'the off-host link is the last page, not a loop').to.have.lengthOf(1);
    });

    it('stops paginating as soon as the marked comment is seen', async () => {
      const calls: Array<{ url: string; init: any }> = [];
      const fetchImpl = (async (url: any, init: any) => {
        calls.push({ url: String(url), init });
        const method = init?.method ?? 'GET';
        if (method === 'GET') {
          return new Response(JSON.stringify([{ id: 99, body: '<!-- marker -->\nold report' }]), {
            status: 200,
            headers: {
              'content-type': 'application/json',
              link: '<https://api.github.com/repos/acme/shop/issues/7/comments?per_page=100&page=2>; rel="next"',
            },
          });
        }
        return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
      }) as typeof fetch;
      const client = new GitHubClient({ token: 'tok', repo: 'acme/shop', fetchImpl });
      await client.upsertComment(7, '<!-- marker -->', '<!-- marker -->\nnew report');

      const gets = calls.filter((c) => (c.init?.method ?? 'GET') === 'GET');
      expect(gets, 'the match on page 1 makes page 2 pointless').to.have.lengthOf(1);
      expect(calls.filter((c) => c.init?.method === 'PATCH')).to.have.lengthOf(1);
    });

    it('exhausting the page budget throws instead of posting a duplicate', async () => {
      // "Ran out of budget" must not read as "absent": a POST here would add a duplicate report on
      // every later push. The throw surfaces through the caller's existing warn-and-skip path.
      const calls: Array<{ url: string; init: any }> = [];
      const fetchImpl = (async (url: any, init: any) => {
        calls.push({ url: String(url), init });
        return new Response(JSON.stringify([{ id: 1, body: 'unrelated' }]), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            link: '<https://api.github.com/repos/acme/shop/issues/7/comments?per_page=100&page=2>; rel="next"',
          },
        });
      }) as typeof fetch;
      const client = new GitHubClient({ token: 'tok', repo: 'acme/shop', fetchImpl });
      let thrown: Error | undefined;
      await client.upsertComment(7, '<!-- marker -->', '<!-- marker -->\nbody').catch((e) => (thrown = e));

      expect(thrown, 'the budget exhaustion is an error, not an absence').to.be.an('error');
      expect(calls.some((c) => c.init?.method === 'POST')).to.equal(false);
    });
  });
});
