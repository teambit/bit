import assert from 'assert';

import detective from './';

describe('detective-scss', function () {
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
    detective('@import "_foo.scss";');
    // @ts-ignore
    assert.ok(detective.ast);
  });

  describe('scss', function () {
    it('returns the dependencies of the given .scss file content', function () {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      test('@import "_foo.scss";', ['_foo.scss']);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      test('@import          "_foo.scss";', ['_foo.scss']);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      test('@import "_foo";', ['_foo']);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      test('body { color: blue; } @import "_foo";', ['_foo']);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      test('@import "bar";', ['bar']);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      test('@import "bar"; @import "foo";', ['bar', 'foo']);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      test("@import 'bar';", ['bar']);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      test("@import 'bar.scss';", ['bar.scss']);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      test('@import "_foo.scss";\n@import "_bar.scss";', ['_foo.scss', '_bar.scss']);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      test('@import "_foo.scss";\n@import "_bar.scss";\n@import "_baz";\n@import "_buttons";', [
        '_foo.scss',
        '_bar.scss',
        '_baz',
        '_buttons',
      ]);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      test('@import "_nested.scss"; body { color: blue; a { text-decoration: underline; }}', ['_nested.scss']);
    });

    it('handles comma-separated imports (#2)', function () {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      test('@import "_foo.scss", "bar";', ['_foo.scss', 'bar']);
    });

    it('allows imports with no semicolon', function () {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      test('@import "_foo.scss"\n@import "_bar.scss"', ['_foo.scss', '_bar.scss']);
    });
  });
});
