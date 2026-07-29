import { expect } from 'chai';
import type { GitHostProvider, PrInfo } from './git-host-provider';
import { selectGitHostProvider } from './git-host-provider';
import { GitHubHostProvider, isGitHubRemote } from './github-client';

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

describe('selectGitHostProvider', () => {
  it('picks the provider whose host matches the remote url', () => {
    const providers = [github(), gitlab()];
    expect(selectGitHostProvider(providers, 'git@gitlab.com:acme/shop.git').provider?.name).to.equal('gitlab');
    expect(selectGitHostProvider(providers, 'https://github.com/acme/shop.git').provider?.name).to.equal('github');
  });

  it('never routes a claimed remote to a different provider, even the only configured one', () => {
    // THE guarantee: github claims this remote but has no credentials, and gitlab holds a token. Using
    // gitlab here would create/close/comment on pull requests on the wrong host — so the run goes
    // PR-less instead, and says which provider claimed the remote without being configured.
    const selection = selectGitHostProvider([github(false), gitlab(true)], 'https://github.com/acme/shop');
    expect(selection.provider).to.equal(undefined);
    expect(selection.reason).to.contain('"github"');
    expect(selection.reason).to.contain('not configured');
    // order of registration must not matter to that outcome
    expect(selectGitHostProvider([gitlab(true), github(false)], 'https://github.com/acme/shop').provider).to.equal(
      undefined
    );
    // …and with nothing configured at all, likewise PR-less.
    expect(selectGitHostProvider([github(false), gitlab(false)], 'https://github.com/acme/shop').provider).to.equal(
      undefined
    );
  });

  it('reports every claimant when several claim the remote and none is configured', () => {
    const first = fakeProvider({ name: 'ghe-a', hostPattern: /git\.acme/, configured: false });
    const second = fakeProvider({ name: 'ghe-b', hostPattern: /git\.acme/, configured: false });
    const selection = selectGitHostProvider([first, second], 'https://git.acme.com/acme/shop');
    expect(selection.provider).to.equal(undefined);
    expect(selection.reason).to.contain('"ghe-a"');
    expect(selection.reason).to.contain('"ghe-b"');
  });

  it('falls back to the sole configured provider when no remote url is known', () => {
    expect(selectGitHostProvider([github(true)], undefined).provider?.name).to.equal('github');
    expect(selectGitHostProvider([github(false), gitlab(true)], undefined).provider?.name).to.equal('gitlab');
  });

  it('falls back to the sole configured provider for a remote no provider claims', () => {
    // e.g. a self-hosted GitLab on a custom domain, or an `insteadOf` rewrite of the origin url.
    expect(
      selectGitHostProvider([github(false), gitlab(true)], 'git@git.acme.internal:acme/shop.git').provider?.name
    ).to.equal('gitlab');
  });

  it('selects nothing when two configured providers both fail to claim the remote', () => {
    // Ambiguous: guessing could comment on the wrong host's PR, so degrade to git-only sync.
    const selection = selectGitHostProvider([github(true), gitlab(true)], 'git@git.acme.internal:acme/shop.git');
    expect(selection.provider).to.equal(undefined);
    expect(selection.reason).to.contain('ambiguous');
    expect(selectGitHostProvider([github(true), gitlab(true)], undefined).provider).to.equal(undefined);
  });

  it('selects nothing when nothing is configured, and when nothing is registered', () => {
    expect(selectGitHostProvider([github(false), gitlab(false)], undefined).provider).to.equal(undefined);
    const empty = selectGitHostProvider([], 'https://github.com/acme/shop');
    expect(empty.provider).to.equal(undefined);
    expect(empty.reason).to.contain('no git host provider is registered');
  });

  it('always explains itself when it selects nothing', () => {
    const cases = [
      selectGitHostProvider([], undefined),
      selectGitHostProvider([github(false)], undefined),
      selectGitHostProvider([github(false)], 'https://github.com/acme/shop'),
      selectGitHostProvider([github(true), gitlab(true)], undefined),
    ];
    cases.forEach((selection) => {
      expect(selection.provider).to.equal(undefined);
      expect(selection.reason).to.be.a('string');
      expect((selection.reason ?? '').length, 'a skipped run must never be silent').to.be.greaterThan(0);
    });
    // …and stays quiet when it does select one.
    expect(selectGitHostProvider([github(true)], 'https://github.com/acme/shop').reason).to.equal(undefined);
  });

  it('passes the remote url to isConfigured, so a host can derive its repo from it', () => {
    // GitHub's real behaviour: without GITHUB_REPOSITORY the repo comes from the origin url, so
    // "configured" is a function of the remote — not of the environment alone.
    const seen: Array<string | undefined> = [];
    const derivesRepoFromRemote = fakeProvider({
      name: 'github',
      hostPattern: /github\.com/,
      configured: (remoteUrl) => {
        seen.push(remoteUrl);
        return Boolean(remoteUrl?.includes('github.com'));
      },
    });
    expect(selectGitHostProvider([derivesRepoFromRemote], 'https://github.com/acme/shop').provider?.name).to.equal(
      'github'
    );
    expect(seen).to.deep.equal(['https://github.com/acme/shop']);
    expect(selectGitHostProvider([derivesRepoFromRemote], undefined).provider).to.equal(undefined);
  });

  it('breaks ties by registration order when two providers claim the same remote', () => {
    const first = fakeProvider({ name: 'first', hostPattern: /github\.com/, configured: true });
    const second = fakeProvider({ name: 'second', hostPattern: /github\.com/, configured: true });
    expect(selectGitHostProvider([first, second], 'https://github.com/acme/shop').provider?.name).to.equal('first');
  });
});

// The built-in provider, exercised through the interface it is registered as — the GitHub *client*
// (API shapes, auth headers) is covered by github-client.spec.ts.
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

  it('claims github.com remotes only', () => {
    expect(isGitHubRemote('git@github.com:acme/shop.git')).to.equal(true);
    expect(isGitHubRemote('https://github.com/acme/shop')).to.equal(true);
    expect(isGitHubRemote('https://gitlab.com/acme/shop.git')).to.equal(false);
    // enterprise / look-alike hosts are not github.com and need their own provider
    expect(isGitHubRemote('git@github.acme.com:acme/shop.git')).to.equal(false);
    expect(isGitHubRemote('https://mygithub.com/acme/shop')).to.equal(false);
  });

  it('is registrable without credentials: constructing it never throws and it reports unconfigured', () => {
    const provider = new GitHubHostProvider();
    expect(provider.name).to.equal('github');
    expect(provider.isConfigured('https://github.com/acme/shop')).to.equal(false);
    const selection = selectGitHostProvider([provider], 'https://github.com/acme/shop');
    expect(selection.provider).to.equal(undefined);
    expect(selection.reason).to.contain('"github"');
  });

  it('is configured once a token is present, deriving the repo from the remote url', () => {
    process.env.BIT_GITHUB_TOKEN = 'tok';
    const provider = new GitHubHostProvider();
    expect(provider.isConfigured('git@github.com:acme/shop.git')).to.equal(true);
    // no repo resolvable (no GITHUB_REPOSITORY, no parseable remote) => still unconfigured
    expect(new GitHubHostProvider().isConfigured(undefined)).to.equal(false);
    // a look-alike host must not be parsed into a repo aimed at api.github.com
    expect(new GitHubHostProvider().isConfigured('https://mygithub.com/acme/shop')).to.equal(false);
  });

  it('remembers the remote url it was asked about, so a later call without one still resolves', () => {
    process.env.BIT_GITHUB_TOKEN = 'tok';
    const provider = new GitHubHostProvider();
    // only `matchesRemote` carried the url; the origin-parse path (and therefore what a PR method
    // reaches through `requireClient`) must survive that
    expect(provider.matchesRemote('git@github.com:acme/shop.git')).to.equal(true);
    expect(provider.isConfigured()).to.equal(true);
    // without that hint the same call cannot resolve a repository
    expect(new GitHubHostProvider().isConfigured()).to.equal(false);
  });

  it('reports what is missing rather than failing obscurely when a PR call happens unconfigured', async () => {
    const provider = new GitHubHostProvider();
    let message = '';
    await provider.findPrByBranch('lane-x').catch((err) => {
      message = err.message;
    });
    expect(message).to.contain('GITHUB_TOKEN');
    expect(message).to.contain('GITHUB_REPOSITORY');
  });
});
