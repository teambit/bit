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
});
