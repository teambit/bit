import assert from 'assert';

import detective from './';

describe('detective-sass', function () {
  function test(src, deps, opts?: any) {
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
      test('@import _foo', ['_foo']);
      test('@import        _foo', ['_foo']);
      test('@import reset', ['reset']);
    });
  });

  describe('use keyword', function () {
    it('returns the dependencies of the given .sass file content', function () {
      test('@use _foo', ['_foo']);
      test('@use        _foo', ['_foo']);
      test('@use reset', ['reset']);
    });
  });

  describe('use as syntax', function () {
    it('returns the dependencies of the given .sass file content', function () {
      test('@use "foo" as f', ['foo']);
      test('@use "_foo" as *', ['_foo']);
    });
  });

  describe('forward keyword', function () {
    it('returns the dependencies of the given .sass file content', function () {
      test('@forward _foo', ['_foo']);
      test('@forward        _foo', ['_foo']);
      test('@forward reset', ['reset']);
    });
  });

  describe('use syntax with colon', function () {
    it('should return only the package name (the part before the colon)', function () {
      test('@use "pkg:math"', ['pkg']);
    });
    it('should return an empty array when it is a built-in module', function () {
      test('@use "sass:math"', []);
    });
  });
});
