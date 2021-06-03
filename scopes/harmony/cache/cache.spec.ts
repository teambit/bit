import { expect } from 'chai';
import { Logger } from '@teambit/logger';
import { CacheMain } from './cache.main.runtime';

describe('Cache Aspect', () => {
  const cache = new CacheMain({ cacheDirectory: '/tmp/bit/cacheDirectory' }, new Logger('cache.main.runtime'));
  it('it should set cache with ttl', async () => {
    await cache.set('_bla', 'bla', 1000);
    const data = await cache.get('_bla');
    expect(data).to.equal('bla');
  });

  it('it should expire cache', async () => {
    await cache.set('_bla', 'bla', 1);
    const data = await cache.get('_bla');
    expect(data).to.equal(null);
  });

  it('it should set cache without expire ttl', async () => {
    await cache.set('_bla', 'bla');
    const data = await cache.get('_bla');
    expect(data).to.equal('bla');
  });
});
