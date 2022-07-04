import { v4 } from 'uuid';
import { rmdirSync } from 'fs';
import { expect } from 'chai';
import { Logger } from '@teambit/logger';
import { CacheMain } from './cache.main.runtime';

describe('Cache Aspect', () => {
  const cacheDirectory = `/tmp/bit/${v4()}`;
  const cache = new CacheMain({ cacheDirectory }, new Logger('cache.main.runtime'));
  it('it should set cache with ttl', async () => {
    await cache.set('_foo', 'bar', 1000);
    const data = await cache.get('_foo');
    expect(data).to.equal('bar');
  });

  // this test is flaky, it fails often on CircleCI.
  // it('it should expire cache', async () => {
  //   await cache.set('_foo', 'bar', 1);
  //   const data = await cache.get('_foo');
  //   expect(data).to.equal(null);
  // });

  it('it should set cache without expire ttl', async () => {
    await cache.set('_foo', 'bar');
    const data = await cache.get('_foo');
    expect(data).to.equal('bar');
  });

  afterAll(() => {
    rmdirSync(cacheDirectory, { recursive: true });
  });
});
