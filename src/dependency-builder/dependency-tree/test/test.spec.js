import assert from 'assert';
import sinon from 'sinon';
import mockfs from 'mock-fs';
import path from 'path';
import precinct from '../../precinct';
import rewire from 'rewire';
import Config from '../Config';

// Bootstrap lazy requires
import resolve from 'resolve';
import typescript from 'typescript';
import moduleDefinition from 'module-definition';

const dependencyTree = rewire('../');

describe('dependencyTree', function() {
  this.timeout(8000);
  function testTreesForFormat(format, ext = '.js') {
    it('returns an object form of the dependency tree for a file', function() {
      const root = `${__dirname}/example/${format}`;
      const filename = `${root}/a${ext}`;

      const tree = dependencyTree({filename, root});

      assert(tree instanceof Object);

      const aSubTree = tree[filename];

      assert.ok(aSubTree instanceof Object);
      const filesInSubTree = Object.keys(aSubTree);

      assert.equal(filesInSubTree.length, 2);
    });
  }

  function mockStylus() {
    mockfs({
      [__dirname + '/example/stylus']: {
        'a.styl': `
          @import "b"
          @require "c.styl"
        `,
        'b.styl': '@import "c"',
        'c.styl': ''
      }
    });
  }

  function mockSass() {
    mockfs({
      [__dirname + '/example/sass']: {
        'a.scss': `
          @import "_b";
          @import "_c.scss";
        `,
        '_b.scss': 'body { color: blue; }',
        '_c.scss': 'body { color: pink; }'
      }
    });
  }

  function mockLess() {
    mockfs({
      [__dirname + '/example/less']: {
        'a.less': `
          @import "b.css";
          @import "c.less";
        `,
        'b.css': 'body { color: blue; }',
        'c.less': 'body { color: pink; }'
      }
    });
  }

  function mockes6() {
    mockfs({
      [__dirname + '/example/es6']: {
        'a.js': `
          import b from './b';
          import c from './c';
        `,
        'b.js': 'export default function() {};',
        'c.js': 'export default function() {};',
        'jsx.js': `import c from './c';\n export default <jsx />;`,
        'foo.jsx': `import React from 'react';\n import b from 'b';\n export default <jsx />;`,
        'es7.js': `import c from './c';\n export default async function foo() {};`
      }
    });
  }

  function mockTS() {
    mockfs({
      [__dirname + '/example/ts']: {
        'a.ts': `
          import b from './b';
          import c from './c';
        `,
        'b.ts': 'export default function() {};',
        'c.ts': 'export default function() {};'
      }
    });
  }

  afterEach(function() {
    mockfs.restore();
  });

  it('returns an empty object for a non-existent filename', function() {
    mockfs({
      imaginary: {}
    });

    const root = __dirname + '/imaginary';
    const filename = root + '/notafile.js';
    const tree = dependencyTree({filename, root});

    assert(tree instanceof Object);
    assert(!Object.keys(tree).length);
  });

  it('handles nested tree structures', function() {
    mockfs({
      [__dirname + '/extended']: {
        'a.js': `var b = require('./b');
                 var c = require('./c');`,
        'b.js': `var d = require('./d');
                 var e = require('./e');`,
        'c.js': `var f = require('./f');
                 var g = require('./g');`,
        'd.js': '',
        'e.js': '',
        'f.js': '',
        'g.js': ''
      }
    });

    const directory = __dirname + '/extended';
    const filename = directory + '/a.js';

    const tree = dependencyTree({filename, directory});
    assert(tree[filename] instanceof Object);

    // b and c
    const subTree = tree[filename];
    assert.equal(Object.keys(subTree).length, 2);

    const bTree = subTree[directory + '/b.js'];
    const cTree = subTree[directory + '/c.js'];
    // d and e
    assert.equal(Object.keys(bTree).length, 2);
    // f ang g
    assert.equal(Object.keys(cTree).length, 2);
  });

  it('does not include files that are not real (#13)', function() {
    mockfs({
      [__dirname + '/onlyRealDeps']: {
        'a.js': 'var notReal = require("./notReal");'
      }
    });

    const directory = __dirname + '/onlyRealDeps';
    const filename = directory + '/a.js';

    const tree = dependencyTree({filename, directory});
    const subTree = tree[filename];

    assert.ok(!Object.keys(subTree).some(dep => dep.indexOf('notReal') !== -1));
  });

  it('does not choke on cyclic dependencies', function() {
    mockfs({
      [__dirname + '/cyclic']: {
        'a.js': 'var b = require("./b");',
        'b.js': 'var a = require("./a");'
      }
    });

    const directory = __dirname + '/cyclic';
    const filename = directory + '/a.js';

    const spy = sinon.spy(dependencyTree, '_getDependencies');

    const tree = dependencyTree({filename, directory});

    assert(spy.callCount === 2);
    assert(Object.keys(tree[filename]).length);

    dependencyTree._getDependencies.restore();
  });

  it('excludes Nodejs core modules by default', function() {
    const directory = __dirname + '/example/commonjs';
    const filename = directory + '/b.js';

    const tree = dependencyTree({filename, directory});
    assert(Object.keys(tree[filename]).length === 0);
    assert(Object.keys(tree)[0].indexOf('b.js') !== -1);
  });

  it('traverses installed 3rd party node modules', function() {
    const directory = __dirname + '/example/onlyRealDeps';
    const filename = directory + '/a.js';

    const tree = dependencyTree({filename, directory});
    const subTree = tree[filename];

    assert(Object.keys(subTree).some(dep => dep === require.resolve('debug')));
  });

  it('returns a list of absolutely pathed files', function() {
    const directory = __dirname + '/example/commonjs';
    const filename = directory + '/b.js';

    const tree = dependencyTree({filename, directory});

    for (let node in tree.nodes) {
      assert(node.indexOf(process.cwd()) !== -1);
    }
  });

  it('excludes duplicate modules from the tree', function() {
    mockfs({
      root: {
        // More than one module includes c
        'a.js': `import b from "b";
                 import c from "c";`,
        'b.js': 'import c from "c";',
        'c.js': 'export default 1;'
      }
    });

    const tree = dependencyTree.toList({
      filename: 'root/a.js',
      directory: 'root'
    });

    assert(tree.length === 3);
  });

  describe('when given a detective configuration', function() {
    it('passes it through to precinct', function() {
      const spy = sinon.spy(precinct, 'paperwork');
      const directory = __dirname + '/example/onlyRealDeps';
      const filename = directory + '/a.js';
      const detectiveConfig = {
        amd: {
          skipLazyLoaded: true
        }
      };

      dependencyTree({
        filename,
        directory,
        detective: detectiveConfig
      });

      assert.ok(spy.calledWith(filename, detectiveConfig));
      spy.restore();
    });
  });

  describe('when given a list to store non existent partials', function() {
    describe('and the file contains no valid partials', function() {
      it('stores the invalid partials', function() {
        mockfs({
          [__dirname + '/onlyRealDeps']: {
            'a.js': 'var notReal = require("./notReal");'
          }
        });

        const directory = __dirname + '/onlyRealDeps';
        const filename = directory + '/a.js';
        const nonExistent = [];

        const tree = dependencyTree({filename, directory, nonExistent});

        assert.equal(nonExistent.length, 1);
        assert.equal(nonExistent[0], './notReal');
      });
    });

    describe('and the file contains all valid partials', function() {
      it('does not store anything', function() {
        mockfs({
          [__dirname + '/onlyRealDeps']: {
            'a.js': 'var b = require("./b");',
            'b.js': 'export default 1;'
          }
        });

        const directory = __dirname + '/onlyRealDeps';
        const filename = directory + '/a.js';
        const nonExistent = [];

        const tree = dependencyTree({filename, directory, nonExistent});

        assert.equal(nonExistent.length, 0);
      });
    });

    describe('and the file contains a mix of invalid and valid partials', function() {
      it('stores the invalid ones', function() {
        mockfs({
          [__dirname + '/onlyRealDeps']: {
            'a.js': 'var b = require("./b");',
            'b.js': 'var c = require("./c"); export default 1;',
            'c.js': 'var crap = require("./notRealMan");'
          }
        });

        const directory = __dirname + '/onlyRealDeps';
        const filename = directory + '/a.js';
        const nonExistent = [];

        const tree = dependencyTree({filename, directory, nonExistent});

        assert.equal(nonExistent.length, 1);
        assert.equal(nonExistent[0], './notRealMan');
      });
    });

    describe('and there is more than one reference to the invalid partial', function() {
      it('only includes the non-existent partial once', function() {
        mockfs({
          [__dirname + '/onlyRealDeps']: {
            'a.js': 'var b = require("./b");\nvar crap = require("./notRealMan");',
            'b.js': 'var c = require("./c"); export default 1;',
            'c.js': 'var crap = require("./notRealMan");'
          }
        });

        const directory = __dirname + '/onlyRealDeps';
        const filename = directory + '/a.js';
        const nonExistent = [];

        const tree = dependencyTree({filename, directory, nonExistent});

        assert.equal(nonExistent.length, 1);
        assert.equal(nonExistent[0], './notRealMan');
      });
    });
  });

  describe('throws', function() {
    beforeEach(function() {
      this._directory = __dirname + '/example/commonjs';
      this._revert = dependencyTree.__set__('traverse', () => []);
    });

    afterEach(function() {
      this._revert();
    });

    it('throws if the filename is missing', function() {
      assert.throws(function() {
        dependencyTree({
          filename: undefined,
          directory: this._directory
        });
      });
    });

    it('throws if the root is missing', function() {
      assert.throws(function() {
        dependencyTree({filename});
      });
    });

    it('throws if a supplied filter is not a function', function() {
      assert.throws(function() {
        const directory = __dirname + '/example/onlyRealDeps';
        const filename = directory + '/a.js';

        const tree = dependencyTree({
          filename,
          directory,
          filter: 'foobar'
        });
      });
    });

    it('does not throw on the legacy `root` option', function() {
      assert.doesNotThrow(function() {
        const directory = __dirname + '/example/onlyRealDeps';
        const filename = directory + '/a.js';

        const tree = dependencyTree({
          filename,
          root: directory
        });
      });
    });
  });

  describe('on file error', function() {
    beforeEach(function() {
      this._directory = __dirname + '/example/commonjs';
    });

    it('does not throw', function() {
      assert.doesNotThrow(() => {
        dependencyTree({
          filename: 'foo',
          directory: this._directory
        });
      });
    });

    it('returns no dependencies', function() {
      const tree = dependencyTree({filename: 'foo', directory: this._directory});
      assert(!tree.length);
    });
  });

  describe('memoization (#2)', function() {
    beforeEach(function() {
      this._spy = sinon.spy(dependencyTree, '_getDependencies');
    });

    afterEach(function() {
      dependencyTree._getDependencies.restore();
    });

    it('accepts a cache object for memoization (#2)', function() {
      const filename = __dirname + '/example/amd/a.js';
      const directory = __dirname + '/example/amd';
      const cache = {};

      cache[__dirname + '/example/amd/b.js'] = [
        __dirname + '/example/amd/b.js',
        __dirname + '/example/amd/c.js'
      ];

      const tree = dependencyTree({
        filename,
        directory,
        visited: cache
      });

      assert.equal(Object.keys(tree[filename]).length, 2);
      assert(this._spy.neverCalledWith(__dirname + '/example/amd/b.js'));
    });

    it('returns the precomputed list of a cached entry point', function() {
      const filename = __dirname + '/example/amd/a.js';
      const directory = __dirname + '/example/amd';

      const cache = {
        // Shouldn't process the first file's tree
        [filename]: []
      };

      const tree = dependencyTree({
        filename,
        directory,
        visited: cache
      });

      assert(!tree.length);
    });
  });

  describe('module formats', function() {
    describe('amd', function() {
      testTreesForFormat('amd');
    });

    describe('commonjs', function() {
      testTreesForFormat('commonjs');
    });

    describe('es6', function() {
      beforeEach(function() {
        this._directory = __dirname + '/example/es6';
        mockes6();
      });

      testTreesForFormat('es6');

      it('resolves files that have jsx', function() {
        const filename = `${this._directory}/jsx.js`;
        const {[filename]: tree} = dependencyTree({
          filename,
          directory: this._directory
        });

        assert.ok(tree[`${this._directory}/c.js`]);
      });

      it('resolves files with a jsx extension', function() {
        const filename = `${this._directory}/foo.jsx`;
        const {[filename]: tree} = dependencyTree({
          filename,
          directory: this._directory
        });

        assert.ok(tree[`${this._directory}/b.js`]);
      });

      it('resolves files that have es7', function() {
        const filename = `${this._directory}/es7.js`;
        const {[filename]: tree} = dependencyTree({
          filename,
          directory: this._directory
        });

        assert.ok(tree[`${this._directory}/c.js`]);
      });
    });

    describe('sass', function() {
      beforeEach(function() {
        mockSass();
      });

      testTreesForFormat('sass', '.scss');
    });

    describe('stylus', function() {
      beforeEach(function() {
        mockStylus();
      });

      testTreesForFormat('stylus', '.styl');
    });

    describe('less', function() {
      beforeEach(function() {
        mockLess();
      });

      testTreesForFormat('less', '.less');
    });

    describe('typescript', function() {
      beforeEach(function() {
        mockTS();
      });

      testTreesForFormat('ts', '.ts');
    });
  });

  describe('toList', function() {
    function testToList(format, ext = '.js') {
      it('returns a post-order list form of the dependency tree', function() {
        const directory = __dirname + '/example/' + format;
        const filename = directory + '/a' + ext;

        const list = dependencyTree.toList({
          filename,
          directory
        });

        assert(list instanceof Array);
        assert(list.length);
      });
    }

    it('returns an empty list on a non-existent filename', function() {
      mockfs({
        imaginary: {}
      });

      const directory = __dirname + '/imaginary';
      const filename = directory + '/notafile.js';

      const list = dependencyTree.toList({
        filename,
        directory
      });

      assert(list instanceof Array);
      assert(!list.length);
    });

    it('orders the visited files by last visited', function() {
      const directory = __dirname + '/example/amd';
      const filename = directory + '/a.js';
      const list = dependencyTree.toList({
        filename,
        directory
      });

      assert(list.length === 3);
      assert(list[0] === directory + '/c.js');
      assert(list[1] === directory + '/b.js');
      assert(list[list.length - 1] === filename);
    });

    describe('module formats', function() {
      describe('amd', function() {
        testToList('amd');
      });

      describe('commonjs', function() {
        testToList('commonjs');
      });

      describe('es6', function() {
        beforeEach(function() {
          mockes6();
        });

        testToList('es6');
      });

      describe('sass', function() {
        beforeEach(function() {
          mockSass();
        });

        testToList('sass', '.scss');
      });

      describe('stylus', function() {
        beforeEach(function() {
          mockStylus();
        });

        testToList('stylus', '.styl');
      });

      describe('less', function() {
        beforeEach(function() {
          mockLess();
        });

        testToList('less', '.less');
      });

      describe('typescript', function() {
        beforeEach(function() {
          mockTS();
        });

        testToList('ts', '.ts');
      });
    });
  });

  describe('webpack', function() {
    beforeEach(function() {
      // Note: not mocking because webpack's resolver needs a real project with dependencies;
      // otherwise, we'd have to mock a ton of files.
      this._root = path.join(__dirname, '../');
      this._webpackConfig = this._root + '/webpack.config.js';

      this._testResolution = name => {
        const results = dependencyTree.toList({
          filename: `${__dirname}/example/webpack/${name}.js`,
          directory: this._root,
          webpackConfig: this._webpackConfig,
          filter: filename => filename.indexOf('filing-cabinet') !== -1
        });

        assert.ok(results.some(filename => filename.indexOf('node_modules/filing-cabinet') !== -1));
      };
    });

    it('resolves aliased modules', function() {
      this.timeout(5000);
      this._testResolution('aliased');
    });

    it('resolves unaliased modules', function() {
      this.timeout(5000);
      this._testResolution('unaliased');
    });
  });

  describe('requirejs', function() {
    beforeEach(function() {
      mockfs({
        root: {
          'lodizzle.js': 'define({})',
          'require.config.js': `
            requirejs.config({
              baseUrl: './',
              paths: {
                F: './lodizzle.js'
              }
            });
          `,
          'a.js': `
            define([
              'F'
            ], function(F) {

            });
          `,
          'b.js': `
            define([
              './lodizzle'
            ], function(F) {

            });
          `
        }
      });
    });

    it('resolves aliased modules', function() {
      const tree = dependencyTree({
        filename: 'root/a.js',
        directory: 'root',
        config: 'root/require.config.js'
      });

      const filename = path.resolve(process.cwd(), 'root/a.js');
      const aliasedFile = path.resolve(process.cwd(), 'root/lodizzle.js');
      assert.ok('root/lodizzle.js' in tree[filename]);
    });

    it('resolves non-aliased paths', function() {
      const tree = dependencyTree({
        filename: 'root/b.js',
        directory: 'root',
        config: 'root/require.config.js'
      });

      const filename = path.resolve(process.cwd(), 'root/b.js');
      const aliasedFile = path.resolve(process.cwd(), 'root/lodizzle.js');
      assert.ok('root/lodizzle.js' in tree[filename]);
    });
  });

  describe('when a filter function is supplied', function() {
    it('uses the filter to determine if a file should be included in the results', function() {
      const directory = __dirname + '/example/onlyRealDeps';
      const filename = directory + '/a.js';

      const tree = dependencyTree({
        filename,
        directory,
        // Skip all 3rd party deps
        filter: (filePath, moduleFile) => {
          assert.ok(require.resolve('debug'));
          assert.ok(moduleFile.match('test/example/onlyRealDeps/a.js'));
          return filePath.indexOf('node_modules') === -1;
        }
      });

      const subTree = tree[filename];
      assert.ok(Object.keys(tree).length);

      const has3rdPartyDep = Object.keys(subTree).some(dep => dep === require.resolve('debug'));
      assert.ok(!has3rdPartyDep);
    });
  });

  describe('when given a CJS file with lazy requires', function() {
    beforeEach(function() {
      mockfs({
        [__dirname + '/cjs']: {
          'foo.js': 'module.exports = function(bar = require("./bar")) {};',
          'bar.js': 'module.exports = 1;'
        }
      });
    });

    it('includes the lazy dependency', function() {
      const directory = __dirname + '/cjs';
      const filename = directory + '/foo.js';

      const tree = dependencyTree({filename, directory});
      const subTree = tree[filename];

      assert.ok(`${directory}/bar.js` in subTree);
    });
  });

  describe('when given an es6 file using CJS lazy requires', function() {
    beforeEach(function() {
      mockfs({
        [__dirname + '/es6']: {
          'foo.js': 'export default function(bar = require("./bar")) {};',
          'bar.js': 'export default 1;'
        }
      });
    });

    describe('and mixedImport mode is turned on', function() {
      it('includes the lazy dependency', function() {
        const directory = __dirname + '/es6';
        const filename = directory + '/foo.js';

        const tree = dependencyTree({
          filename,
          directory,
          detective: {
            es6: {
              mixedImports: true
            }
          }
        });

        const subTree = tree[filename];

        assert.ok(`${directory}/bar.js` in subTree);
      });

      it('also works for toList', function() {
        const directory = __dirname + '/es6';
        const filename = directory + '/foo.js';

        const results = dependencyTree.toList({
          filename,
          directory,
          detective: {
            es6: {
              mixedImports: true
            }
          }
        });

        assert.equal(results[0], `${directory}/bar.js`);
        assert.equal(results[1], filename);
      });
    });

    describe('and mixedImport mode is turned off', function() {
      it('does not include the lazy dependency', function() {
        const directory = __dirname + '/es6';
        const filename = directory + '/foo.js';

        const tree = dependencyTree({
          filename,
          directory
        });

        const subTree = tree[filename];

        assert.ok(!(`${directory}/bar.js` in subTree));
      });
    });
  });

  describe('when given an es6 file using dynamic imports', function() {
    beforeEach(function() {
      mockfs({
        [__dirname + '/es6']: {
          'foo.js': 'import("./bar");',
          'bar.js': 'export default 1;'
        }
      });
    });

    it('includes the dynamic import', function() {
      const directory = __dirname + '/es6';
      const filename = directory + '/foo.js';

      const tree = dependencyTree({
        filename,
        directory
      });

      const subTree = tree[filename];

      assert.ok(!(`${directory}/bar.js` in subTree));
    });
  });

  describe('when given a CJS file with module property in package.json', function() {
    beforeEach(function() {
      mockfs({
        [__dirname + '/es6']: {
          ['module.entry.js']: 'import * as module from "module.entry"',
          ['node_modules']: {
            ['module.entry']: {
              'index.main.js': 'module.exports = function() {};',
              'index.module.js': 'module.exports = function() {};',
              'package.json': '{ "main": "index.main.js", "module": "index.module.js" }'
            }
          }
        }
      });
    });

    it('it includes the module entry as dependency', function() {
      const directory = __dirname + '/es6';
      const filename = directory + '/module.entry.js';

      const tree = dependencyTree({
        filename,
        directory,
        nodeModulesConfig: {
          entry: 'module'
        }
      });
      const subTree = tree[filename];

      assert.ok(`${directory}/node_modules/module.entry/index.module.js` in subTree);
    });
  });

  describe('Config', function() {
    describe('when cloning', function() {
      describe('and a detective config was set', function() {
        it('retains the detective config in the clone', function() {
          const detectiveConfig = {
            es6: {
              mixedImports: true
            }
          };

          const config = new Config({
            detectiveConfig,
            filename: 'foo',
            directory: 'bar'
          });

          const clone = config.clone();

          assert.deepEqual(clone.detectiveConfig, detectiveConfig);
        });
      });
    });
  });
});
