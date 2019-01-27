const detective = require('./');
const assert = require('assert');

describe('detective-sass', function () {
  function test(src, deps, opts) {
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
    assert.ok(detective.ast);
  });

  describe('sass', function () {
    it('returns the dependencies of the given .sass file content', function () {
      test('@import _foo', ['_foo']);
      test('@import        _foo', ['_foo']);
      test('@import reset', ['reset']);
    });
  });
});
