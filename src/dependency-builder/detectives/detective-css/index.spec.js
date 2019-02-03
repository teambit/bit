const detective = require('./');
const assert = require('assert');

describe('detective-css', function () {
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
    detective('@import "_foo.css";');

    assert.ok(detective.ast);
  });

  describe('css', function () {
    it('returns the dependencies of the given .css file content', function () {
      test('@import "_foo.css";', ['_foo.css']);
      test('@import          "_foo.css";', ['_foo.css']);
      test('@import "_foo";', ['_foo']);
      test('body { color: blue; } @import "_foo";', ['_foo']);
      test('@import "bar";', ['bar']);
      test('@import "bar"; @import "foo";', ['bar', 'foo']);
      test("@import 'bar';", ['bar']);
      test("@import 'bar.css';", ['bar.css']);
      test('@import "_foo.css";\n@import "_bar.css";', ['_foo.css', '_bar.css']);
      test('@import "_foo.css";\n@import "_bar.css";\n@import "_baz";\n@import "_buttons";', [
        '_foo.css',
        '_bar.css',
        '_baz',
        '_buttons'
      ]);
    });

    it('handles simple import', function () {
      test('@import "_foo.css"', ['_foo.css']);
    });

    it('handles comma-separated imports (#2)', function () {
      test('@import "_foo.css", "bar";', ['_foo.css', 'bar']);
    });

    it('allows imports with no semicolon', function () {
      test('@import "_foo.css"\n@import "_bar.css"', ['_foo.css', '_bar.css']);
    });

    it('not allow https and http', function () {
      test('@import url("https://fonts.googleapis.com/css?family=Lato:100,300,400,700,900");"', []);
    });

    it('not allow ftp', function () {
      test('@import url("ftp://fonts.googleapis.com/css?family=Lato:100,300,400,700,900");"', []);
    });
  });
});
