/* eslint-env mocha */
import assert from 'assert';
import { expect } from 'chai';

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
              name: 'x',
            },
            init: {
              type: 'Literal',
              value: 4,
              raw: '4',
            },
          },
        ],
        kind: 'let',
      },
    ],
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
        // @ts-ignore
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

  it('does not throw with empty import and export', () => {
    assert.doesNotThrow(() => {
      detective("import './layout.scss'; export default something;");
    });
  });

  describe('string in apostrophes', () => {
    it('should recognize when using require statement', () => {
      const deps = detective('const foo = require(`foo`);'); // eslint-disable-line
      const depsKeys = Object.keys(deps);
      assert.equal(depsKeys.length, 1);
      assert.equal(depsKeys[0], 'foo');
    });
  });

  describe('Angular Decorators', () => {
    let deps;
    before(() => {
      const componentDecorator = `const styleUrl = './my-style2.css';
      @Component({
        selector: 'main-component',
        templateUrl: './my-template.html',
        styleUrls: ['./my-style1.css', styleUrl, './my-style3.css', 'my-style4.css']
      })
      export class MainComponent {}`;
      const results = detective(componentDecorator); // eslint-disable-line
      deps = Object.keys(results);
    });
    it('should recognize the templateUrl as a dependency', () => {
      expect(deps).to.include('./my-template.html');
    });
    it('should recognize the styleUrls as dependencies', () => {
      expect(deps).to.include('./my-style1.css');
      expect(deps).to.include('./my-style3.css');
    });
    it('should not recognize dynamic style (style path entered as a variable)', () => {
      expect(deps).to.not.include('./my-style2.css');
    });
    it('should change non-relative paths to be relative', () => {
      expect(deps).to.include('./my-style4.css');
    });
  });
});
