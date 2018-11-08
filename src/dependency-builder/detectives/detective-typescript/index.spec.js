/* eslint-env mocha */
import { expect } from 'chai';
import assert from 'assert';
import detective from './';

describe('detective-typescript', () => {
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

  it('retrieves the dependencies of modules', () => {
    const deps = detective('import {foo, bar} from "mylib";');
    const depsKeys = Object.keys(deps);
    assert(depsKeys.length === 1);
    expect(deps).to.have.property('mylib');
  });

  it('retrieves the re-export dependencies of modules', () => {
    const deps = detective('export {foo, bar} from "mylib";');
    const depsKeys = Object.keys(deps);
    assert(depsKeys.length === 1);
    expect(deps).to.have.property('mylib');
  });

  it('retrieves the re-export * dependencies of modules', () => {
    const deps = detective('export * from "mylib";');
    const depsKeys = Object.keys(deps);
    assert(depsKeys.length === 1);
    expect(deps).to.have.property('mylib');
  });

  it('handles multiple imports', () => {
    const deps = detective('import {foo, bar} from "mylib";\nimport "mylib2"');
    const depsKeys = Object.keys(deps);
    assert(depsKeys.length === 2);
    expect(deps).to.have.property('mylib');
    expect(deps).to.have.property('mylib2');
  });

  it('handles mixed imports of typescript and javascript', () => {
    const deps = detective('import {foo, bar} from "mylib";\nconst mylib2 = require("mylib2");');
    const depsKeys = Object.keys(deps);
    assert(depsKeys.length === 2);
    expect(deps).to.have.property('mylib');
    expect(deps).to.have.property('mylib2');
  });

  it('handles default imports', () => {
    const deps = detective('import foo from "foo";');
    const depsKeys = Object.keys(deps);
    assert(depsKeys.length === 1);
    expect(deps).to.have.property('foo');
  });

  it('retrieves dependencies from modules using "export ="', () => {
    const deps = detective('import foo = require("mylib");');
    const depsKeys = Object.keys(deps);
    assert(depsKeys.length === 1);
    expect(deps).to.have.property('mylib');
  });

  it('retrieves dependencies when using javascript syntax', () => {
    const deps = detective('var foo = require("foo");');
    const depsKeys = Object.keys(deps);
    assert(depsKeys.length === 1);
    expect(deps).to.have.property('foo');
  });

  it('returns an empty list for empty files', () => {
    const deps = detective('');
    const depsKeys = Object.keys(deps);
    assert.equal(depsKeys.length, 0);
  });

  it('throws when content is not provided', () => {
    assert.throws(
      () => {
        detective();
      },
      Error,
      'src not given'
    );
  });

  it('does not throw with jsx in a module', () => {
    assert.doesNotThrow(() => {
      detective("import foo from 'foo'; var baz = <baz>bar;");
    });
  });
});
