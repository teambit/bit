import { expect } from 'chai';
import type { Component } from '@teambit/component';
import type { ComponentID } from '@teambit/component-id';
import { ComponentCache } from './component-cache';

/**
 * Lightweight stubs — the cache only consults `ComponentID.toString()` and
 * stores the `Component` reference without inspecting its shape. Casting
 * through `unknown` keeps the tests focused on cache semantics, not on the
 * domain types' constructors.
 */
function id(str: string): ComponentID {
  return { toString: () => str } as unknown as ComponentID;
}

function comp(label: string): Component {
  return { __label: label } as unknown as Component;
}

describe('ComponentCache', () => {
  describe('hit', () => {
    it('returns the stored component when the hash matches', () => {
      const cache = new ComponentCache(10);
      const a = id('teambit.foo/bar');
      const value = comp('a-files');
      cache.set(a, 'files', value, 'hash-1');
      expect(cache.get(a, 'files', 'hash-1')).to.equal(value);
    });

    it('separates entries by phase: same id, different phase ⇒ separate entries', () => {
      const cache = new ComponentCache(10);
      const a = id('teambit.foo/bar');
      cache.set(a, 'files', comp('a-files'), 'hash-1');
      cache.set(a, 'dependencies', comp('a-deps'), 'hash-2');
      expect(cache.get(a, 'files', 'hash-1')).to.have.property('__label', 'a-files');
      expect(cache.get(a, 'dependencies', 'hash-2')).to.have.property('__label', 'a-deps');
      expect(cache.size()).to.equal(2);
    });
  });

  describe('stale on input change', () => {
    it('returns undefined and evicts when the file signature changed', () => {
      const cache = new ComponentCache(10);
      const a = id('teambit.foo/bar');
      cache.set(a, 'files', comp('original'), 'file-sig-old');
      // Simulating a file change: the loader now computes a new hash and asks the cache.
      expect(cache.get(a, 'files', 'file-sig-new')).to.equal(undefined);
      // Stale entry must have been evicted, so size is back to zero.
      expect(cache.size()).to.equal(0);
    });

    it('returns undefined and evicts when the bitmap hash changed', () => {
      const cache = new ComponentCache(10);
      const a = id('teambit.foo/bar');
      cache.set(a, 'identity', comp('id-only'), 'bitmap-1');
      expect(cache.get(a, 'identity', 'bitmap-2')).to.equal(undefined);
      expect(cache.has(a, 'identity')).to.equal(false);
    });

    it('does not affect other components when one becomes stale', () => {
      const cache = new ComponentCache(10);
      const a = id('teambit.foo/a');
      const b = id('teambit.foo/b');
      cache.set(a, 'files', comp('a'), 'hA');
      cache.set(b, 'files', comp('b'), 'hB');
      // a's inputs change
      expect(cache.get(a, 'files', 'hA-new')).to.equal(undefined);
      // b is still hot
      expect(cache.get(b, 'files', 'hB')).to.have.property('__label', 'b');
    });
  });

  describe('invalidate one component', () => {
    it('removes every phase entry for the given id', () => {
      const cache = new ComponentCache(10);
      const a = id('teambit.foo/a');
      const b = id('teambit.foo/b');
      cache.set(a, 'files', comp('a-files'), 'h');
      cache.set(a, 'dependencies', comp('a-deps'), 'h');
      cache.set(a, 'aspects', comp('a-aspects'), 'h');
      cache.set(b, 'files', comp('b-files'), 'h');

      const removed = cache.invalidate(a);

      expect(removed).to.equal(3);
      expect(cache.has(a, 'files')).to.equal(false);
      expect(cache.has(a, 'dependencies')).to.equal(false);
      expect(cache.has(a, 'aspects')).to.equal(false);
      expect(cache.has(b, 'files')).to.equal(true);
      expect(cache.size()).to.equal(1);
    });

    it('accepts an array of component IDs', () => {
      const cache = new ComponentCache(10);
      const a = id('teambit.foo/a');
      const b = id('teambit.foo/b');
      const c = id('teambit.foo/c');
      cache.set(a, 'files', comp('a'), 'h');
      cache.set(b, 'files', comp('b'), 'h');
      cache.set(c, 'files', comp('c'), 'h');
      expect(cache.invalidate([a, b])).to.equal(2);
      expect(cache.size()).to.equal(1);
      expect(cache.has(c, 'files')).to.equal(true);
    });
  });

  describe('invalidate all', () => {
    it('clears the cache entirely', () => {
      const cache = new ComponentCache(10);
      const a = id('teambit.foo/a');
      const b = id('teambit.foo/b');
      cache.set(a, 'files', comp('a'), 'h');
      cache.set(b, 'aspects', comp('b'), 'h');
      const removed = cache.invalidate('all');
      expect(removed).to.equal(2);
      expect(cache.size()).to.equal(0);
    });
  });

  describe('invalidate by phase', () => {
    it('removes only entries at the given phase', () => {
      const cache = new ComponentCache(10);
      const a = id('teambit.foo/a');
      const b = id('teambit.foo/b');
      cache.set(a, 'files', comp('a-files'), 'h');
      cache.set(a, 'extensions', comp('a-ext'), 'h');
      cache.set(b, 'extensions', comp('b-ext'), 'h');

      const removed = cache.invalidate({ phase: 'extensions' });

      expect(removed).to.equal(2);
      expect(cache.has(a, 'files')).to.equal(true);
      expect(cache.has(a, 'extensions')).to.equal(false);
      expect(cache.has(b, 'extensions')).to.equal(false);
    });

    it('handles a phase with no entries gracefully', () => {
      const cache = new ComponentCache(10);
      cache.set(id('teambit.foo/a'), 'files', comp('a'), 'h');
      expect(cache.invalidate({ phase: 'aspects' })).to.equal(0);
      expect(cache.size()).to.equal(1);
    });
  });

  describe('eviction', () => {
    it('drops the least-recently-set entry when over capacity', () => {
      const cache = new ComponentCache(2);
      const a = id('teambit.foo/a');
      const b = id('teambit.foo/b');
      const c = id('teambit.foo/c');
      cache.set(a, 'files', comp('a'), 'h');
      cache.set(b, 'files', comp('b'), 'h');
      cache.set(c, 'files', comp('c'), 'h'); // evicts a

      expect(cache.has(a, 'files')).to.equal(false);
      expect(cache.has(b, 'files')).to.equal(true);
      expect(cache.has(c, 'files')).to.equal(true);
      expect(cache.size()).to.equal(2);
    });

    it('a recent get keeps an entry alive across evictions', () => {
      const cache = new ComponentCache(2);
      const a = id('teambit.foo/a');
      const b = id('teambit.foo/b');
      const c = id('teambit.foo/c');
      cache.set(a, 'files', comp('a'), 'h');
      cache.set(b, 'files', comp('b'), 'h');
      // Touch a so it becomes most-recently-used.
      expect(cache.get(a, 'files', 'h')).to.exist;
      // b is now LRU; this set should evict b, not a.
      cache.set(c, 'files', comp('c'), 'h');
      expect(cache.has(a, 'files')).to.equal(true);
      expect(cache.has(b, 'files')).to.equal(false);
      expect(cache.has(c, 'files')).to.equal(true);
    });
  });
});
