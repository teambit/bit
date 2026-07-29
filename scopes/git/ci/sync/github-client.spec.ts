import { expect } from 'chai';
import { GitHubClient, isGitHubRemote, parseGitHubRepo } from './github-client';

describe('parseGitHubRepo', () => {
  it('parses ssh and https remote urls', () => {
    expect(parseGitHubRepo('git@github.com:acme/shop.git')).to.equal('acme/shop');
    expect(parseGitHubRepo('https://github.com/acme/shop.git')).to.equal('acme/shop');
    expect(parseGitHubRepo('https://github.com/acme/shop')).to.equal('acme/shop');
    expect(parseGitHubRepo('https://gitlab.com/acme/shop.git')).to.equal(undefined);
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
    // A claim is exclusive: claiming this remote would hand every PR operation for a GitLab-hosted
    // mirror to the GitHub provider, which cannot serve it.
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
