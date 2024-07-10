import { expect } from 'chai';
import { DependencyDetector } from '../detector-hook';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const rewire = require('rewire');
const sinon = require('sinon');

const fixtures = '../fixtures/precinct';
const fixturesFullPath = path.resolve(__dirname, fixtures);
const exampleASTPath = path.join(fixtures, 'exampleAST');
// eslint-disable-next-line import/no-dynamic-require, global-require
const ast = require(exampleASTPath);

const precinctNonWired = rewire('./');
const precinct = precinctNonWired.default;

function read(filename) {
  return fs.readFileSync(path.join(fixturesFullPath, filename), 'utf8');
}

describe('node-precinct', () => {
  it('accepts an AST', () => {
    const deps = precinct(ast);
    const depsKeys = Object.keys(deps);
    assert(depsKeys.length === 1);
  });

  it('dangles off a given ast', () => {
    precinct(ast);
    assert.deepEqual(precinct.ast, ast);
  });

  it('dangles off the parsed ast from a .js file', () => {
    precinct(read('amd.js'));
    assert.ok(precinct.ast);
    assert.notDeepEqual(precinct.ast, ast);
  });

  it('dangles off the parsed ast from a scss detective', () => {
    precinct(read('styles.scss'), 'scss');
    assert.notDeepEqual(precinct.ast, {});
  });

  it('dangles off the parsed ast from a sass detective', () => {
    precinct(read('styles.sass'), 'sass');
    assert.notDeepEqual(precinct.ast, {});
  });

  it('grabs dependencies of amd modules', () => {
    const amd = precinct(read('amd.js'));
    assert(amd.indexOf('./a') !== -1);
    assert(amd.indexOf('./b') !== -1);
    assert(amd.length === 2);
  });

  it('grabs dependencies of commonjs modules', () => {
    const cjs = precinct(read('commonjs.js'));
    expect(cjs).to.have.property('./a');
    expect(cjs).to.have.property('./b');
    assert(Object.keys(cjs).length === 2);
  });

  it('grabs dependencies of es6 modules', () => {
    const cjs = precinct(`import { square, diag } from 'lib';
console.log(square(11)); // 121
console.log(diag(4, 3)); // 5`);
    expect(cjs).to.have.property('lib');
    assert(Object.keys(cjs).length === 1);
  });

  it('grabs dependencies of es6 modules with embedded jsx', () => {
    const cjs = precinct(`import { square, diag } from 'lib';
const tmpl = <jsx />;`);
    expect(cjs).to.have.property('lib');
    assert(Object.keys(cjs).length === 1);
  });

  it('grabs dependencies of es6 modules with embedded es7', () => {
    const cjs = precinct(`import { square, diag } from 'lib';
async function foo() {}`);
    expect(cjs).to.have.property('lib');
    assert(Object.keys(cjs).length === 1);
  });

  it('throws errors of es6 modules with syntax errors', () => {
    const precinctFunc = () =>
      precinct(`import { square, diag } from 'lib' // error, semicolon
console.log(square(11)); // 121
console.log(diag(4, 3); // 5, error, missing paren`);
    expect(precinctFunc).to.throw();
  });

  // this is for supporting PostCSS dialect. The implementation is not merged to this project.
  // see the following PR of node-precinct: https://github.com/dependents/node-precinct/pull/40
  it.skip('grabs dependencies of css files', () => {
    const css = precinct(read('styles.css'), 'css');
    expect(css).to.have.property('foo.css');
    expect(css).to.have.property('baz.css');
    expect(css).to.have.property('bla.css');
    expect(css).to.have.property('another.css');
  });

  it('grabs dependencies of scss files', function () {
    const scss = precinct(read('styles.scss'), 'scss');
    assert.deepEqual(scss, ['_foo', 'baz.scss']);
  });

  it('grabs dependencies of sass files', () => {
    const sass = precinct(read('styles.sass'), 'sass');
    assert.deepEqual(sass, ['_foo']);
  });

  it('grabs dependencies of stylus files', () => {
    const result = precinct(read('styles.styl'), 'stylus');
    const expected = ['mystyles', 'styles2.styl', 'styles3.styl', 'styles4'];

    assert.deepEqual(result, expected);
  });

  it('grabs dependencies of less files', () => {
    const result = precinct(read('styles.less'), 'less');
    const expected = ['_foo', '_bar.css', 'baz.less'];

    assert.deepEqual(result, expected);
  });
  // todo: fix this one once we have a way to ignore some component files from compiling/parsing altogether
  // uncomment typescript.ts
  it.skip('grabs dependencies of typescript files', () => {
    const result = precinct(read('typescript.ts'), 'ts');
    const expected = ['fs', 'lib', './bar', './my-module.js', './ZipCodeValidator'];

    assert.deepEqual(Object.keys(result), expected);
  });

  it('throws errors of typescript modules with syntax errors', () => {
    const precinctFunc = () =>
      precinct(`import { square, diag } from 'lib';
console.log(diag(4, 3); // error, missing bracket
`);
    expect(precinctFunc).to.throw();
  });

  it('supports the object form of type configuration', () => {
    const result = precinct(read('styles.styl'), { type: 'stylus' });
    const expected = ['mystyles', 'styles2.styl', 'styles3.styl', 'styles4'];

    assert.deepEqual(result, expected);
  });

  it('yields no dependencies for es6 modules with no imports', () => {
    const cjs = precinct(`export const sqrt = Math.sqrt;
export function square(x) {
  return x * x;
}
export function diag(x, y) {
  return sqrt(square(x) + square(y));
}
`);
    assert.equal(Object.keys(cjs).length, 0);
  });

  it('yields no dependencies for non-modules', () => {
    const none = precinct(`var a = new window.Foo();`);
    assert.equal(Object.keys(none).length, 0);
  });

  it('throw on unparsable .js files', () => {
    assert.throws(() => {
      precinct(`{
	"very invalid": "javascript",
	"this", "is actually json",
	"But" not even valid json.
}
`);
    }, SyntaxError);
  });

  it('does not blow up when parsing a gruntfile #2', () => {
    assert.doesNotThrow(() => {
      precinct(read('Gruntfile.js'));
    });
  });

  describe('paperwork', () => {
    // todo: currently it doesn't work because we set it with bit-no-check
    it.skip('returns the dependencies for the given filepath', () => {
      assert.ok(Object.keys(precinct.paperwork(`${fixturesFullPath}/es6.js`)).length);
      assert.ok(Object.keys(precinct.paperwork(`${fixturesFullPath}/styles.scss`)).length);
      // todo: uncomment the next line and typescript.ts file once we have a way to ignore some component files from compiling/parsing altogether
      // assert.ok(Object.keys(precinct.paperwork(`${fixturesFullPath}/typescript.ts`)).length);
      assert.ok(Object.keys(precinct.paperwork(`${fixturesFullPath}/styles.css`)).length);
    });

    it('throws if the file cannot be found', () => {
      assert.throws(() => {
        precinct.paperwork('foo');
      });
    });

    it('filters out core modules if options.includeCore is false', () => {
      const deps = precinct.paperwork(`${fixturesFullPath}/coreModules.js`, {
        includeCore: false,
      });

      assert(!deps.length);
    });

    // todo: currently it doesn't work because we set it with bit-no-check
    it.skip('does not filter out core modules by default', () => {
      const deps = precinct.paperwork(`${fixturesFullPath}/coreModules.js`);
      assert(Object.keys(deps).length);
    });

    // todo: currently it doesn't work because we set it with bit-no-check
    it.skip('supports passing detective configuration', () => {
      const config = {
        amd: {
          skipLazyLoaded: true,
        },
      };

      const deps = precinct.paperwork(`${fixturesFullPath}/amd.js`, {
        includeCore: false,
        amd: config.amd,
      });
      assert.deepEqual(deps, ['./a', './b']);
    });

    it('supports passing env detectors', () => {
      const detector: DependencyDetector = {
        detect: (fileContent: string) => {
          return fileContent.indexOf('foo') === -1 ? [] : ['foo'];
        },
        isSupported: ({ ext }) => {
          return ext === '.foo';
        },
        type: 'foo',
      };
      const result = precinct.paperwork(`${fixturesFullPath}/foo.foo`, {
        envDetectors: [detector],
      });
      assert.deepEqual(result, []);

      const result2 = precinct.paperwork(`${fixturesFullPath}/bar.foo`, {
        envDetectors: [detector],
      });
      assert.deepEqual(result2, ['foo']);
    });

    describe('when given detective configuration', () => {
      // This test case doesn't fit the current implementation of precinct.
      it.skip('still does not filter out core module by default', () => {
        const stub = sinon.stub().returns([]);
        const revert = precinctNonWired.__set__('precinct', stub);

        precinct.paperwork(`${fixturesFullPath}/amd.js`, {
          amd: {
            skipLazyLoaded: true,
          },
        });

        assert.equal(stub.args[0][1].includeCore, true);
        revert();
      });
    });
  });

  describe('when given a configuration object', () => {
    it('passes amd config to the amd detective', () => {
      const config = {
        amd: {
          skipLazyLoaded: true,
        },
      };

      const deps = precinct(read('amd.js'), config);
      assert.deepEqual(deps, ['./a', './b']);
    });

    describe('that sets mixedImports for es6', () => {
      describe('for a file identified as es6', () => {
        it('returns both the commonjs and es6 dependencies', () => {
          const deps = precinct(read('es6MixedImport.js'), {
            es6: {
              mixedImports: true,
            },
          });

          assert.equal(Object.keys(deps).length, 2);
        });
      });

      describe('for a file identified as cjs', () => {
        it('returns both the commonjs and es6 dependencies', () => {
          const deps = precinct(read('cjsMixedImport.js'), {
            es6: {
              mixedImports: true,
            },
          });

          assert.equal(Object.keys(deps).length, 2);
        });
      });
    });
  });

  describe('when lazy exported dependencies in CJS', () => {
    it('grabs those lazy dependencies', () => {
      const cjs = precinct(read('cjsExportLazy.js'));
      expect(cjs).to.have.property('./amd');
      expect(cjs).to.have.property('./es6');
      expect(cjs).to.have.property('./es7');
      assert.equal(Object.keys(cjs).length, 3);
    });
  });

  describe('when given an es6 file', () => {
    describe('that uses CJS imports for lazy dependencies', () => {
      it('grabs the lazy imports', () => {
        const es6 = precinct(read('es6MixedExportLazy.js'), {
          es6: {
            mixedImports: true,
          },
        });
        expect(es6).to.have.property('./amd');
        expect(es6).to.have.property('./es6');
        expect(es6).to.have.property('./es7');
        assert.equal(Object.keys(es6).length, 3);
      });
    });
  });
});
