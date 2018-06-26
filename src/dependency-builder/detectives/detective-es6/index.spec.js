/**
 * this file had been forked (and changed since then) from https://github.com/dependents/node-detective-es6
 */

const assert = require('assert');
const detective = require('./');

describe('detective-es6', () => {
  const ast = {
    type: 'Program',
    body: [
      {
        type: 'VariableDeclaration',
        declarations: [
          {
            type: 'VariableDeclarator',
            id: {
              type: 'Identifier',
              name: 'x'
            },
            init: {
              type: 'Literal',
              value: 4,
              raw: '4'
            }
          }
        ],
        kind: 'let'
      }
    ]
  };

  it('accepts an ast', () => {
    const deps = detective(ast);
    const depsKeys = Object.keys(deps);
    assert(!depsKeys.length);
  });

  it('retrieves the dependencies of es6 modules', () => {
    const deps = detective('import {foo, bar} from "mylib";');
    const depsKeys = Object.keys(deps);
    assert(depsKeys.length === 1);
    assert(depsKeys[0] === 'mylib');
  });

  it('retrieves the re-export dependencies of es6 modules', () => {
    const deps = detective('export {foo, bar} from "mylib";');
    const depsKeys = Object.keys(deps);
    assert(depsKeys.length === 1);
    assert(depsKeys[0] === 'mylib');
  });

  it('retrieves the re-export * dependencies of es6 modules', () => {
    const deps = detective('export * from "mylib";');
    const depsKeys = Object.keys(deps);
    assert(depsKeys.length === 1);
    assert(depsKeys[0] === 'mylib');
  });

  it('handles multiple imports', () => {
    const deps = detective('import {foo, bar} from "mylib";\nimport "mylib2"');
    const depsKeys = Object.keys(deps);
    assert(depsKeys.length === 2);
    assert(depsKeys[0] === 'mylib');
    assert(depsKeys[1] === 'mylib2');
  });

  it('handles default imports', () => {
    const deps = detective('import foo from "foo";');
    const depsKeys = Object.keys(deps);
    assert(depsKeys.length === 1);
    assert(depsKeys[0] === 'foo');
  });

  it('handles dynamic imports', function () {
    const deps = detective('import("foo").then(foo => foo());');
    const depsKeys = Object.keys(deps);
    assert(depsKeys.length === 1);
    assert(depsKeys[0] === 'foo');
  });

  it('should support commonJS syntax', function () {
    const deps = detective('var foo = require("foo");');
    const depsKeys = Object.keys(deps);
    assert(depsKeys.length === 1);
    assert(depsKeys[0] === 'foo');
  });

  it('returns an empty list for empty files', function () {
    const deps = detective('');
    const depsKeys = Object.keys(deps);
    assert.equal(depsKeys.length, 0);
  });

  it('throws when content is not provided', function () {
    assert.throws(
      function () {
        detective();
      },
      Error,
      'src not given'
    );
  });

  it('does not throw with jsx in a module', function () {
    assert.doesNotThrow(function () {
      detective("import foo from 'foo'; var templ = <jsx />;");
    });
  });

  it('does not throw on an async ES7 function', function () {
    assert.doesNotThrow(function () {
      detective("import foo from 'foo'; export default async function foo() {}");
    });
  });
});
