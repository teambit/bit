import { expect } from 'chai';
import type { Logger } from '@teambit/logger';
import { git } from './git';
import { SourceBranchDetector } from './source-branch-detector';

/**
 * The post-merge PR lookup sends GITHUB_TOKEN to the API it queries, so the API must be the one of the
 * host the repository lives on — never the runner's enterprise API for a github.com repository, and
 * never a GITHUB_API_URL the GITHUB_SERVER_URL instance can't vouch for.
 */
describe('SourceBranchDetector GitHub API lookup', () => {
  const envKeys = [
    'GITHUB_TOKEN',
    'GITHUB_REPOSITORY',
    'GITHUB_API_URL',
    'GITHUB_SERVER_URL',
    'CIRCLE_PROJECT_USERNAME',
    'CIRCLE_PROJECT_REPONAME',
    'CIRCLE_REPOSITORY_URL',
  ];
  const saved: Record<string, string | undefined> = {};
  const realFetch = globalThis.fetch;
  const realRaw = git.raw;
  const realLog = git.log;
  let calls: string[];
  let origin: string;

  const logger = { console: () => {} } as unknown as Logger;
  const SHA = 'abc123';

  beforeEach(() => {
    envKeys.forEach((key) => {
      saved[key] = process.env[key];
      delete process.env[key];
    });
    process.env.GITHUB_TOKEN = 'tok';
    calls = [];
    origin = '';
    globalThis.fetch = (async (url: any) => {
      calls.push(String(url));
      return new Response(JSON.stringify([{ number: 7, head: { ref: 'feature-x' } }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    (git as any).raw = async () => origin;
    // the commit-message fallback finds nothing, so only the API can name the branch
    (git as any).log = async () => ({ latest: { message: 'squash', body: '' } });
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    (git as any).raw = realRaw;
    (git as any).log = realLog;
    envKeys.forEach((key) => {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    });
  });

  const lookup = () => new SourceBranchDetector(logger).getSourceBranchName(SHA);

  it('queries api.github.com for a github.com origin, with no enterprise variables (unchanged default)', async () => {
    origin = 'git@github.com:acme/shop.git';
    expect(await lookup()).to.equal('feature-x');
    expect(calls).to.deep.equal([`https://api.github.com/repos/acme/shop/commits/${SHA}/pulls`]);
  });

  describe('on a GHES-configured runner', () => {
    beforeEach(() => {
      process.env.GITHUB_SERVER_URL = 'https://ghe.corp.example';
      process.env.GITHUB_API_URL = 'https://ghe.corp.example/api/v3';
    });

    it('queries api.github.com for a github.com origin', async () => {
      origin = 'https://github.com/acme/shop.git';
      expect(await lookup()).to.equal('feature-x');
      expect(calls).to.deep.equal([`https://api.github.com/repos/acme/shop/commits/${SHA}/pulls`]);
    });

    it('queries api.github.com for a CircleCI github.com project', async () => {
      process.env.CIRCLE_PROJECT_USERNAME = 'acme';
      process.env.CIRCLE_PROJECT_REPONAME = 'shop';
      process.env.CIRCLE_REPOSITORY_URL = 'git@github.com:acme/shop.git';
      expect(await lookup()).to.equal('feature-x');
      expect(calls).to.deep.equal([`https://api.github.com/repos/acme/shop/commits/${SHA}/pulls`]);
    });

    it('queries the GHES API for an enterprise origin, and for GITHUB_REPOSITORY on the enterprise runner', async () => {
      origin = 'git@ghe.corp.example:acme/store.git';
      expect(await lookup()).to.equal('feature-x');
      process.env.GITHUB_REPOSITORY = 'acme/store';
      expect(await lookup()).to.equal('feature-x');
      expect(calls).to.deep.equal([
        `https://ghe.corp.example/api/v3/repos/acme/store/commits/${SHA}/pulls`,
        `https://ghe.corp.example/api/v3/repos/acme/store/commits/${SHA}/pulls`,
      ]);
    });

    it('derives <server>/api/v3 when GITHUB_API_URL is unset', async () => {
      delete process.env.GITHUB_API_URL;
      origin = 'https://ghe.corp.example/acme/store.git';
      expect(await lookup()).to.equal('feature-x');
      expect(calls).to.deep.equal([`https://ghe.corp.example/api/v3/repos/acme/store/commits/${SHA}/pulls`]);
    });

    it('sends nothing when GITHUB_API_URL is not on the enterprise host', async () => {
      process.env.GITHUB_API_URL = 'https://api.github.com';
      origin = 'https://ghe.corp.example/acme/store.git';
      expect(await lookup()).to.equal(null);
      expect(calls).to.have.lengthOf(0);
    });
  });
});
