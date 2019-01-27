const detective = require('./');
const assert = require('assert');

describe('detective-scss', function () {
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
    detective('@import "_foo.scss";');

    assert.ok(detective.ast);
  });

  describe('scss', function () {
    it('returns the dependencies of the given .scss file content', function () {
      test('@import "_foo.scss";', ['_foo.scss']);
      test('@import          "_foo.scss";', ['_foo.scss']);
      test('@import "_foo";', ['_foo']);
      test('body { color: blue; } @import "_foo";', ['_foo']);
      test('@import "bar";', ['bar']);
      test('@import "bar"; @import "foo";', ['bar', 'foo']);
      test("@import 'bar';", ['bar']);
      test("@import 'bar.scss';", ['bar.scss']);
      test('@import "_foo.scss";\n@import "_bar.scss";', ['_foo.scss', '_bar.scss']);
      test('@import "_foo.scss";\n@import "_bar.scss";\n@import "_baz";\n@import "_buttons";', [
        '_foo.scss',
        '_bar.scss',
        '_baz',
        '_buttons'
      ]);
      test('@import "_nested.scss"; body { color: blue; a { text-decoration: underline; }}', ['_nested.scss']);
    });

    it('handles comma-separated imports (#2)', function () {
      test('@import "_foo.scss", "bar";', ['_foo.scss', 'bar']);
    });

    it('allows imports with no semicolon', function () {
      test('@import "_foo.scss"\n@import "_bar.scss"', ['_foo.scss', '_bar.scss']);
    });
  });
});
