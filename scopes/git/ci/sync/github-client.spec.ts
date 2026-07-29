import { expect } from 'chai';
import { GitHubClient, parseGitHubRepo } from './github-client';

describe('parseGitHubRepo', () => {
  it('parses ssh and https remote urls', () => {
    expect(parseGitHubRepo('git@github.com:acme/shop.git')).to.equal('acme/shop');
    expect(parseGitHubRepo('https://github.com/acme/shop.git')).to.equal('acme/shop');
    expect(parseGitHubRepo('https://github.com/acme/shop')).to.equal('acme/shop');
    expect(parseGitHubRepo('https://gitlab.com/acme/shop.git')).to.equal(undefined);
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
      new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
    const client = new GitHubClient({ token: 'tok', repo: 'acme/shop', fetchImpl: fakeFetch });
    expect(await client.findPrByBranch('lane-x')).to.equal(undefined);
  });
});
