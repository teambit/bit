import { expect } from 'chai';
import { LRUCacheAdapter } from './lru-cache-adapter';

const DEFAULT_ENTRY_SIZE = 32 * 1024;

describe('LRUCacheAdapter', () => {
  describe('bounded by count', () => {
    it('should evict the least recently used entry once the count limit is reached', () => {
      const cache = new LRUCacheAdapter<string>({ maxSize: 2 });
      cache.set('a', 'a', 1000); // size is ignored when not bounded by bytes
      cache.set('b', 'b', 1000);
      cache.set('c', 'c', 1000);
      expect(cache.keys().sort()).to.deep.equal(['b', 'c']);
    });
  });
  describe('bounded by bytes', () => {
    it('should keep many small entries as long as their total size fits', () => {
      const cache = new LRUCacheAdapter<string>({ maxBytes: 10_000, defaultEntrySize: DEFAULT_ENTRY_SIZE });
      for (let i = 0; i < 1000; i += 1) cache.set(`key-${i}`, 'value', 10);
      expect(cache.keys()).to.have.lengthOf(1000);
    });
    it('should evict the least recently used entries once the total size exceeds the limit', () => {
      const cache = new LRUCacheAdapter<string>({ maxBytes: 100, defaultEntrySize: DEFAULT_ENTRY_SIZE });
      cache.set('a', 'a', 40);
      cache.set('b', 'b', 40);
      cache.get('a'); // "b" is now the least recently used
      cache.set('c', 'c', 40);
      expect(cache.has('a')).to.be.true;
      expect(cache.has('b')).to.be.false;
      expect(cache.has('c')).to.be.true;
    });
    it('should use the default size estimate for an entry that was set without a size', () => {
      const cache = new LRUCacheAdapter<string>({
        maxBytes: DEFAULT_ENTRY_SIZE * 2,
        defaultEntrySize: DEFAULT_ENTRY_SIZE,
      });
      cache.set('a', 'a');
      cache.set('b', 'b');
      cache.set('c', 'c');
      expect(cache.keys().sort()).to.deep.equal(['b', 'c']);
    });
    it('should charge an explicit zero size as the minimum, not as the default estimate', () => {
      const cache = new LRUCacheAdapter<string>({ maxBytes: 10, defaultEntrySize: DEFAULT_ENTRY_SIZE });
      for (let i = 0; i < 10; i += 1) cache.set(`key-${i}`, 'value', 0);
      expect(cache.keys()).to.have.lengthOf(10);
    });
    it('should re-account the size of an entry that is set again', () => {
      const cache = new LRUCacheAdapter<string>({
        maxBytes: DEFAULT_ENTRY_SIZE * 2,
        defaultEntrySize: DEFAULT_ENTRY_SIZE,
      });
      cache.set('a', 'a'); // charged the default estimate
      cache.set('b', 'b', 10);
      cache.set('a', 'a', DEFAULT_ENTRY_SIZE * 2); // the real size is the whole budget, "b" must go
      expect(cache.has('a')).to.be.true;
      expect(cache.has('b')).to.be.false;
    });
    it('should apply a count limit on top of the bytes limit when both are given', () => {
      const cache = new LRUCacheAdapter<string>({ maxBytes: 10_000, maxSize: 2, defaultEntrySize: DEFAULT_ENTRY_SIZE });
      cache.set('a', 'a', 1);
      cache.set('b', 'b', 1);
      cache.set('c', 'c', 1);
      expect(cache.keys().sort()).to.deep.equal(['b', 'c']);
    });
    it('should not cache an entry bigger than the whole limit', () => {
      const cache = new LRUCacheAdapter<string>({ maxBytes: 100, defaultEntrySize: DEFAULT_ENTRY_SIZE });
      cache.set('a', 'a', 10);
      cache.set('huge', 'huge', 1000);
      expect(cache.has('huge')).to.be.false;
      expect(cache.has('a')).to.be.true;
    });
  });
  describe('weak', () => {
    type Value = { name: string };
    it('should return an evicted value that is still referenced elsewhere, and count it as used again', () => {
      const cache = new LRUCacheAdapter<Value>({ maxSize: 2, weak: true });
      const a = { name: 'a' };
      cache.set('a', a);
      cache.set('b', { name: 'b' });
      cache.set('c', { name: 'c' }); // evicts "a", which is still referenced by `a`
      expect(cache.get('a')).to.equal(a);
      expect(cache.has('a')).to.be.true;
    });
    it('should include evicted values that are still alive in keys, so clearing by key clears them too', () => {
      const cache = new LRUCacheAdapter<Value>({ maxSize: 1, weak: true });
      const a = { name: 'a' };
      cache.set('a', a);
      cache.set('b', { name: 'b' });
      expect(cache.keys()).to.include('a');
      cache.keys().forEach((key) => cache.delete(key));
      expect(cache.get('a')).to.be.undefined;
    });
    it('should not return deleted or cleared values', () => {
      const cache = new LRUCacheAdapter<Value>({ maxSize: 1, weak: true });
      const a = { name: 'a' };
      const b = { name: 'b' };
      cache.set('a', a);
      cache.set('b', b);
      cache.delete('a');
      expect(cache.get('a')).to.be.undefined;
      cache.deleteAll();
      expect(cache.get('b')).to.be.undefined;
    });
    it('should not keep an evicted value alive once nothing else references it', async function () {
      const gc = (global as any).gc;
      if (!gc) this.skip(); // requires running node with --expose-gc
      const cache = new LRUCacheAdapter<Value>({ maxSize: 1, weak: true });
      (() => cache.set('a', { name: 'a' }))();
      cache.set('b', { name: 'b' });
      // a WeakRef keeps its target alive until the end of the current job, so let it end before collecting
      await new Promise((resolve) => setImmediate(resolve));
      gc();
      expect(cache.get('a')).to.be.undefined;
    });
    it('should throw when the cache is not bounded by count', () => {
      expect(() => new LRUCacheAdapter<Value>({ maxAge: 1000, weak: true })).to.throw(/weak/);
    });
  });
});
