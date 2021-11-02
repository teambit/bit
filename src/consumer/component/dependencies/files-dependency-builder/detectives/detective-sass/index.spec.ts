import assert from 'assert';

import detective from './';

describe('detective-sass', function () {
  function test(src, deps, opts) {
    // @ts-ignore
    assert.deepEqual(detective(src, opts), deps);
  }

  describe('throws', function () {
    it('does not throw for empty files', function () {
      assert.doesNotThrow(function () {
        detective('');
      });
    });

    it('throws if the given content is not a string', function () {
      assert.throws(function () {
        detective(function () {});
      });
    });

    it('throws if called with no arguments', function () {
      assert.throws(function () {
        // @ts-ignore
        detective();
      });
    });

    it.skip('throws on broken syntax', function () {
      assert.throws(function () {
        detective('@');
      });
    });
  });

  it('dangles the parsed AST', function () {
    detective('@import _foo');
    // @ts-ignore
    assert.ok(detective.ast);
  });

  describe('sass', function () {
    it('returns the dependencies of the given .sass file content', function () {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      test('@import _foo', ['_foo']);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      test('@import        _foo', ['_foo']);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      test('@import reset', ['reset']);
    });
  });

  describe('use keyword', function () {
    it('returns the dependencies of the given .sass file content', function () {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      test('@use _foo', ['_foo']);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      test('@use        _foo', ['_foo']);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      test('@use reset', ['reset']);
    });
  });

  describe('forward keyword', function () {
    it('returns the dependencies of the given .sass file content', function () {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      test('@forward _foo', ['_foo']);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      test('@forward        _foo', ['_foo']);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      test('@forward reset', ['reset']);
    });
  });
});
