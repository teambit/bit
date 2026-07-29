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
    expect(selectGitHostProvider(providers, 'git@gitlab.com:acme/shop.git')?.name).to.equal('gitlab');
    expect(selectGitHostProvider(providers, 'https://github.com/acme/shop.git')?.name).to.equal('github');
  });

  it('skips a host match that is not configured, and keeps looking', () => {
    // github claims the remote but has no credentials; gitlab is configured but does not claim it, so
    // it only wins through the sole-configured fallback — not by matching.
    expect(selectGitHostProvider([github(false), gitlab(true)], 'https://github.com/acme/shop')?.name).to.equal(
      'gitlab'
    );
    // …and with nothing else configured, an unconfigured host match yields PR-less mode.
    expect(selectGitHostProvider([github(false), gitlab(false)], 'https://github.com/acme/shop')).to.equal(undefined);
  });

  it('falls back to the sole configured provider when no remote url is known', () => {
    expect(selectGitHostProvider([github(true)], undefined)?.name).to.equal('github');
    expect(selectGitHostProvider([github(false), gitlab(true)], undefined)?.name).to.equal('gitlab');
  });

  it('falls back to the sole configured provider for a remote no provider claims', () => {
    // e.g. a self-hosted GitLab on a custom domain, or an `insteadOf` rewrite of the origin url.
    expect(selectGitHostProvider([github(false), gitlab(true)], 'git@git.acme.internal:acme/shop.git')?.name).to.equal(
      'gitlab'
    );
  });

  it('returns undefined when two configured providers both fail to claim the remote', () => {
    // Ambiguous: guessing could comment on the wrong host's PR, so degrade to git-only sync.
    expect(selectGitHostProvider([github(true), gitlab(true)], 'git@git.acme.internal:acme/shop.git')).to.equal(
      undefined
    );
    expect(selectGitHostProvider([github(true), gitlab(true)], undefined)).to.equal(undefined);
  });

  it('returns undefined when nothing is configured, and when nothing is registered', () => {
    expect(selectGitHostProvider([github(false), gitlab(false)], undefined)).to.equal(undefined);
    expect(selectGitHostProvider([], 'https://github.com/acme/shop')).to.equal(undefined);
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
    expect(selectGitHostProvider([derivesRepoFromRemote], 'https://github.com/acme/shop')?.name).to.equal('github');
    expect(seen).to.deep.equal(['https://github.com/acme/shop']);
    expect(selectGitHostProvider([derivesRepoFromRemote], undefined)).to.equal(undefined);
  });

  it('breaks ties by registration order when two providers claim the same remote', () => {
    const first = fakeProvider({ name: 'first', hostPattern: /github\.com/, configured: true });
    const second = fakeProvider({ name: 'second', hostPattern: /github\.com/, configured: true });
    expect(selectGitHostProvider([first, second], 'https://github.com/acme/shop')?.name).to.equal('first');
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
    expect(selectGitHostProvider([provider], 'https://github.com/acme/shop')).to.equal(undefined);
  });

  it('is configured once a token is present, deriving the repo from the remote url', () => {
    process.env.BIT_GITHUB_TOKEN = 'tok';
    const provider = new GitHubHostProvider();
    expect(provider.isConfigured('git@github.com:acme/shop.git')).to.equal(true);
    // no repo resolvable (no GITHUB_REPOSITORY, no parseable remote) => still unconfigured
    expect(new GitHubHostProvider().isConfigured(undefined)).to.equal(false);
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
