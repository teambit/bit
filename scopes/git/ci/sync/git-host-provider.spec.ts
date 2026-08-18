import { expect } from 'chai';
import type { GitHostProvider, PrInfo } from './git-host-provider';
import { selectGitHostProvider } from './git-host-provider';
import { GitHubHostProvider } from './github-client';

/**
 * A provider stub: only `name`, `matchesRemote` and `isConfigured` participate in selection, so the
 * PR methods reject — reaching them from `selectGitHostProvider` would be a bug worth failing on.
 */
function fakeProvider(opts: {
  name: string;
  hostPattern: RegExp;
  configured: boolean | ((remoteUrl?: string) => boolean);
}): GitHostProvider {
  const unreachable = () => Promise.reject(new Error(`${opts.name}: selection must not call PR methods`));
  return {
    name: opts.name,
    matchesRemote: (remoteUrl: string) => opts.hostPattern.test(remoteUrl),
    isConfigured: (remoteUrl?: string) =>
      typeof opts.configured === 'function' ? opts.configured(remoteUrl) : opts.configured,
    findPrByBranch: unreachable as () => Promise<PrInfo | undefined>,
    createPr: unreachable as () => Promise<PrInfo>,
    closePr: unreachable,
    comment: unreachable,
    addLabel: unreachable,
  };
}

const github = (configured = true) => fakeProvider({ name: 'github', hostPattern: /github\.com/, configured });
const gitlab = (configured = true) => fakeProvider({ name: 'gitlab', hostPattern: /gitlab\.com/, configured });
const GH = 'https://github.com/acme/shop';
const UNCLAIMED = 'git@git.acme.internal:acme/shop.git';

const claimants = (...names: string[]) =>
  names.map((name) => fakeProvider({ name, hostPattern: /git\.acme/, configured: false }));
const tied = (...names: string[]) =>
  names.map((name) => fakeProvider({ name, hostPattern: /github\.com/, configured: true }));

/**
 * A claimed remote is NEVER routed to a different provider: acting on the wrong host's PRs is worse
 * than degrading to git-only sync. The sole-configured fallback applies only when no provider claims
 * the remote at all. Every selection of nothing must explain itself; a successful one must stay quiet.
 *
 * [case, providers, remote url, selected provider name, reason fragments].
 */
const SELECTION: Array<[string, GitHostProvider[], string | undefined, string | undefined, string[]?]> = [
  ['by matching host', [github(), gitlab()], 'git@gitlab.com:acme/shop.git', 'gitlab'],
  ['by matching host, the other way round', [github(), gitlab()], GH, 'github'],
  [
    'nothing when the claimant is unconfigured but another is',
    [github(false), gitlab(true)],
    GH,
    undefined,
    ['"github"', 'not configured'],
  ],
  ['nothing regardless of registration order', [gitlab(true), github(false)], GH, undefined, ['"github"']],
  ['nothing when nothing at all is configured', [github(false), gitlab(false)], GH, undefined, ['"github"']],
  [
    'nothing, naming every claimant when several claim and none is configured',
    claimants('ghe-a', 'ghe-b'),
    'https://git.acme.com/acme/shop',
    undefined,
    ['"ghe-a"', '"ghe-b"'],
  ],
  ['the sole configured provider when no remote url is known', [github(true)], undefined, 'github'],
  ['the sole configured of several when no remote url is known', [github(false), gitlab(true)], undefined, 'gitlab'],
  // e.g. a self-hosted GitLab on a custom domain, or an `insteadOf` rewrite of the origin url
  ['the sole configured provider for a remote no provider claims', [github(false), gitlab(true)], UNCLAIMED, 'gitlab'],
  [
    'nothing when two configured providers both fail to claim',
    [github(true), gitlab(true)],
    UNCLAIMED,
    undefined,
    ['ambiguous'],
  ],
  [
    'nothing when two are configured and there is no remote url',
    [github(true), gitlab(true)],
    undefined,
    undefined,
    ['ambiguous'],
  ],
  ['nothing when nothing is registered', [], GH, undefined, ['no git host provider is registered']],
  [
    'nothing when nothing is configured and there is no remote',
    [github(false), gitlab(false)],
    undefined,
    undefined,
    ['no git host provider is configured'],
  ],
  ['the first registered when two configured providers claim the same remote', tied('first', 'second'), GH, 'first'],
];

describe('selectGitHostProvider', () => {
  SELECTION.forEach(([name, providers, remote, picks, reason]) => {
    it(`selects ${name}`, () => {
      const selection = selectGitHostProvider(providers, remote);
      expect(selection.provider?.name, name).to.equal(picks);
      if (picks) {
        expect(selection.reason, 'a successful selection stays quiet').to.equal(undefined);
      } else {
        expect((selection.reason ?? '').length, 'a skipped run must never be silent').to.be.greaterThan(0);
        (reason ?? []).forEach((fragment) => expect(selection.reason).to.contain(fragment));
      }
    });
  });

  it('passes the remote url to isConfigured, so a host can derive its repo from it', () => {
    const seen: Array<string | undefined> = [];
    const derivesRepoFromRemote = fakeProvider({
      name: 'github',
      hostPattern: /github\.com/,
      configured: (remoteUrl) => {
        seen.push(remoteUrl);
        return Boolean(remoteUrl?.includes('github.com'));
      },
    });
    expect(selectGitHostProvider([derivesRepoFromRemote], GH).provider?.name).to.equal('github');
    expect(seen).to.deep.equal([GH]);
    expect(selectGitHostProvider([derivesRepoFromRemote], undefined).provider).to.equal(undefined);
  });
});

// The built-in provider, exercised through the interface it is registered as — the GitHub *client*
// (API shapes, auth headers, remote parsing) is covered by github-client.spec.ts.
describe('GitHubHostProvider', () => {
  const envKeys = ['GITHUB_TOKEN', 'BIT_GITHUB_TOKEN', 'GITHUB_REPOSITORY'] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    envKeys.forEach((key) => {
      saved[key] = process.env[key];
      delete process.env[key];
    });
  });

  afterEach(() => {
    envKeys.forEach((key) => {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    });
  });

  it('is registrable without credentials: constructing it never throws and it reports unconfigured', () => {
    const provider = new GitHubHostProvider();
    expect(provider.name).to.equal('github');
    expect(provider.isConfigured(GH)).to.equal(false);
    const selection = selectGitHostProvider([provider], GH);
    expect(selection.provider).to.equal(undefined);
    expect(selection.reason).to.contain('"github"');
  });

  it('is configured once a token is present, deriving the repo from the remote url', () => {
    process.env.BIT_GITHUB_TOKEN = 'tok';
    expect(new GitHubHostProvider().isConfigured('git@github.com:acme/shop.git')).to.equal(true);
    // no repo resolvable (no GITHUB_REPOSITORY, no parseable remote) => still unconfigured
    expect(new GitHubHostProvider().isConfigured(undefined)).to.equal(false);
    // a look-alike host must not be parsed into a repo aimed at api.github.com
    expect(new GitHubHostProvider().isConfigured('https://mygithub.com/acme/shop')).to.equal(false);
  });

  it('remembers the remote url it was asked about, and only if that remote was ours', () => {
    process.env.BIT_GITHUB_TOKEN = 'tok';
    const ours = new GitHubHostProvider();
    expect(ours.matchesRemote('git@github.com:acme/shop.git')).to.equal(true);
    expect(ours.isConfigured()).to.equal(true);
    // without that hint the same call cannot resolve a repository
    expect(new GitHubHostProvider().isConfigured()).to.equal(false);
    // …and a non-github remote must not poison the hint
    const theirs = new GitHubHostProvider();
    expect(theirs.matchesRemote('https://gitlab.com/acme/shop.git')).to.equal(false);
    expect(theirs.isConfigured()).to.equal(false);
  });

  // On Actions the env is always set, so answering "configured" for an unclaimed remote would make
  // this the sole-configured fallback and aim PRs at whatever GITHUB_REPOSITORY named.
  it('is NOT configured or selected for a remote it does not claim, however complete the environment', () => {
    process.env.BIT_GITHUB_TOKEN = 'tok';
    process.env.GITHUB_REPOSITORY = 'acme/shop';
    expect(new GitHubHostProvider().isConfigured('https://gitlab.com/acme/shop.git')).to.equal(false);
    // non-vacuous: the very same environment DOES configure it for a github remote, and for no remote
    expect(new GitHubHostProvider().isConfigured(GH)).to.equal(true);
    expect(new GitHubHostProvider().isConfigured()).to.equal(true);
    const selection = selectGitHostProvider([new GitHubHostProvider()], 'https://gitlab.com/acme/shop.git');
    expect(selection.provider).to.equal(undefined);
    expect(selection.reason).to.contain('no git host provider is configured');
  });

  it('reports what is missing rather than failing obscurely when a PR call happens unconfigured', async () => {
    let message = '';
    await new GitHubHostProvider().findPrByBranch('lane-x').catch((err) => {
      message = err.message;
    });
    expect(message).to.contain('GITHUB_TOKEN');
    expect(message).to.contain('GITHUB_REPOSITORY');
  });
});
