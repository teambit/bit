import { BIT_TEMP_ROOT } from '@teambit/defender.fs.global-bit-temp-dir';
import assert from 'assert';
import path from 'path';
import rewire from 'rewire';
import sinon from 'sinon';
import fs from 'fs-extra';

import precinct from '../precinct';
import Config from './Config';

const UNIT_TEST_DIR = path.join(BIT_TEMP_ROOT, 'unit-test');
const expect = require('chai').expect;

const dependencyTreeRewired = rewire('./');
const dependencyTree = dependencyTreeRewired.default;
const fixtures = path.resolve(`${__dirname}/../fixtures/dependency-tree`);

function mockfs(obj: any) {
  Object.entries(obj).forEach(([key, value]) => {
    fs.mkdirSync(key, { recursive: true });
    // @ts-ignore
    Object.entries(value).forEach(([file, content]) => {
      const filePath = path.join(key, file);
      fs.writeFileSync(filePath, content as string);
    });
  });
}

function cleanUnitDir() {
  fs.removeSync(UNIT_TEST_DIR);
}

describe('dependencyTree', function () {
  // @ts-ignore
  this.timeout(8000);
  function testTreesForFormat(format, ext = '.js') {
    it('returns an object form of the dependency tree for a file', () => {
      const root = `${UNIT_TEST_DIR}/${format}`;
      const filename = path.normalize(`${root}/a${ext}`);

      const tree = dependencyTree({ filename, root });

      assert(tree instanceof Object);

      const aSubTree = tree[filename];

      assert.ok(aSubTree instanceof Object);
      const filesInSubTree = Object.keys(aSubTree);

      assert.equal(filesInSubTree.length, 2);
    });
  }

  function mockStylus() {
    mockfs({
      [`${UNIT_TEST_DIR}/stylus`]: {
        'a.styl': `
          @import "b"
          @require "c.styl"
        `,
        'b.styl': '@import "c"',
        'c.styl': '',
      },
    });
  }

  function mockSass() {
    mockfs({
      [`${UNIT_TEST_DIR}/sass`]: {
        'a.scss': `
          @import "_b";
          @import "_c.scss";
        `,
        '_b.scss': 'body { color: blue; }',
        '_c.scss': 'body { color: pink; }',
      },
    });
  }

  function mockLess() {
    mockfs({
      [`${UNIT_TEST_DIR}/less`]: {
        'a.less': `
          @import "b.css";
          @import "c.less";
        `,
        'b.css': 'body { color: blue; }',
        'c.less': 'body { color: pink; }',
      },
    });
  }

  function mockcommonjs() {
    mockfs({
      [`${UNIT_TEST_DIR}/commonjs`]: {
        'a.js': `
        var b = require('./b');
        var c = require('./c');
        `,
        'b.js': `
          var path = require('path');
          module.exports = {};
        `,
        'c.js': `
          var fs = require('fs');
          module.exports = {};
        `,
      },
    });
  }

  function mockes6() {
    mockfs({
      [`${UNIT_TEST_DIR}/es6`]: {
        'a.js': `
          import b from './b';
          import c from './c';
        `,
        'b.js': 'export default () => {};',
        'c.js': 'export default () => {};',
        'jsx.js': "import c from './c';\n export default <jsx />;",
        'foo.jsx': "import React from 'react';\n import b from './b';\n export default <jsx />;",
        'es7.js': "import c from './c';\n export default async function foo() {};",
      },
    });
  }

  function mockTS() {
    mockfs({
      [`${UNIT_TEST_DIR}/ts`]: {
        'a.ts': `
          import b from './b';
          import c from './c';
        `,
        'b.ts': 'export default () => {};',
        'c.ts': 'export default () => {};',
      },
    });
  }

  afterEach(() => {
    // mockfs.restore();
    cleanUnitDir();
  });

  it('returns an empty object for a non-existent filename', () => {
    mockfs({
      imaginary: {},
    });

    const root = `${UNIT_TEST_DIR}/imaginary`;
    const filename = `${root}/notafile.js`;
    const tree = dependencyTree({ filename, root });

    assert(tree instanceof Object);
    assert(!Object.keys(tree).length);
  });

  it('handles nested tree structures', () => {
    const directory = `${UNIT_TEST_DIR}/extended`;

    mockfs({
      [directory]: {
        'a.js': `
          var b = require('./b');
          var c = require('./c');`,
        'b.js': `
          var d = require('./d');
          var e = require('./e');`,
        'c.js': `
          var f = require('./f');
          var g = require('./g');`,
        'd.js': '',
        'e.js': '',
        'f.js': '',
        'g.js': '',
      },
    });

    const filename = path.normalize(`${directory}/a.js`);
    const tree = dependencyTree({ filename, directory });
    assert(tree[filename] instanceof Object);

    // b and c
    const subTree = tree[filename];
    assert.equal(subTree.length, 2);

    const bTree = tree[path.normalize(`${directory}/b.js`)];
    const cTree = tree[path.normalize(`${directory}/c.js`)];
    // d and e
    assert.equal(bTree.length, 2);
    // f ang g
    assert.equal(cTree.length, 2);
  });

  it('does not include files that are not real (#13)', () => {
    mockfs({
      [`${UNIT_TEST_DIR}/onlyRealDeps`]: {
        'a.js': 'var notReal = require("./notReal");',
      },
    });

    const directory = `${UNIT_TEST_DIR}/onlyRealDeps`;
    const filename = path.normalize(`${directory}/a.js`);

    const tree = dependencyTree({ filename, directory });
    const subTree = tree[filename];

    assert.ok(!Object.keys(subTree).some((dep) => dep.indexOf('notReal') !== -1));
  });

  it('does not choke on cyclic dependencies', () => {
    mockfs({
      [`${UNIT_TEST_DIR}/cyclic`]: {
        'a.js': 'var b = require("./b");',
        'b.js': 'var a = require("./a");',
      },
    });

    const directory = `${UNIT_TEST_DIR}/cyclic`;
    const filename = path.normalize(`${directory}/a.js`);

    const spy = sinon.spy(dependencyTreeRewired, '_getDependencies');

    const tree = dependencyTreeRewired.default({ filename, directory });

    assert(spy.callCount === 2);
    assert(Object.keys(tree[filename]).length);

    dependencyTreeRewired._getDependencies.restore();
  });

  it('excludes Nodejs core modules by default', () => {
    const directory = `${fixtures}/commonjs`;
    const filename = path.normalize(`${directory}/b.js`);

    const tree = dependencyTree({ filename, directory });
    assert(Object.keys(tree[filename]).length === 0);
    assert(Object.keys(tree)[0].indexOf('b.js') !== -1);
  });

  it('traverses installed 3rd party node modules', () => {
    const directory = `${fixtures}/onlyRealDeps`;
    const filename = path.normalize(`${directory}/a.js`);

    const tree = dependencyTree({ filename, directory });
    const subTree = tree[filename];

    assert(subTree[0].includes('node_modules/debug/src/index.js'));
  });

  it('returns a list of absolutely pathed files', () => {
    const directory = `${UNIT_TEST_DIR}/commonjs`;
    const filename = `${directory}/b.js`;

    const tree = dependencyTree({ filename, directory });
    // eslint-disable-next-line
    for (const node in tree.nodes) {
      assert(node.indexOf(process.cwd()) !== -1);
    }
  });

  describe('when given a detective configuration', () => {
    it('passes it through to precinct', () => {
      const spy = sinon.spy(precinct, 'paperwork');
      const directory = path.normalize(`${fixtures}/onlyRealDeps`);
      const filename = path.normalize(`${directory}/a.js`);
      const detectiveConfig = {
        amd: {
          skipLazyLoaded: true,
        },
      };

      dependencyTree({
        filename,
        directory,
        detective: detectiveConfig,
      });

      assert.ok(spy.calledWith(filename, detectiveConfig));
      spy.restore();
    });
  });

  describe('when given a list to store non existent partials', () => {
    describe('and the file contains no valid partials', () => {
      it('stores the invalid partials', () => {
        mockfs({
          [`${UNIT_TEST_DIR}/onlyRealDeps`]: {
            'a.js': 'var notReal = require("./notReal");',
          },
        });

        const directory = path.normalize(`${UNIT_TEST_DIR}/onlyRealDeps`);
        const filename = path.normalize(`${directory}/a.js`);
        const nonExistent = [];

        dependencyTree({ filename, directory, nonExistent });

        assert.equal(Object.keys(nonExistent).length, 1);
        assert.equal(nonExistent[filename][0], './notReal');
      });
    });

    describe('and the file contains all valid partials', () => {
      it('does not store anything', () => {
        mockfs({
          [`${UNIT_TEST_DIR}/onlyRealDeps`]: {
            'a.js': 'var b = require("./b");',
            'b.js': 'export default 1;',
          },
        });

        const directory = `${UNIT_TEST_DIR}/onlyRealDeps`;
        const filename = `${directory}/a.js`;
        const nonExistent = [];

        dependencyTree({ filename, directory, nonExistent });

        assert.equal(nonExistent.length, 0);
      });
    });

    describe('and the file contains a mix of invalid and valid partials', () => {
      it('stores the invalid ones', () => {
        mockfs({
          [`${UNIT_TEST_DIR}/onlyRealDeps`]: {
            'a.js': 'var b = require("./b");',
            'b.js': 'var c = require("./c"); export default 1;',
            'c.js': 'var crap = require("./notRealMan");',
          },
        });

        const directory = path.normalize(`${UNIT_TEST_DIR}/onlyRealDeps`);
        const filename = path.normalize(`${directory}/a.js`);
        const nonExistent = [];

        dependencyTree({ filename, directory, nonExistent });

        assert.equal(Object.keys(nonExistent).length, 1);
        assert.equal(nonExistent[path.normalize(`${directory}/c.js`)][0], './notRealMan');
      });
    });

    describe('and there is more than one reference to the invalid partial', () => {
      it('should include the non-existent partial per file', () => {
        mockfs({
          [`${UNIT_TEST_DIR}/onlyRealDeps`]: {
            'a.js': 'var b = require("./b");\nvar crap = require("./notRealMan");',
            'b.js': 'var c = require("./c"); export default 1;',
            'c.js': 'var crap = require("./notRealMan");',
          },
        });

        const directory = path.normalize(`${UNIT_TEST_DIR}/onlyRealDeps`);
        const filename = path.normalize(`${directory}/a.js`);
        const nonExistent = [];

        dependencyTree({ filename, directory, nonExistent });

        assert.equal(Object.keys(nonExistent).length, 2);
        assert.equal(nonExistent[filename][0], './notRealMan');
        assert.equal(nonExistent[path.normalize(`${directory}/c.js`)][0], './notRealMan');
      });
    });
  });

  describe('throws', () => {
    beforeEach(() => {
      // @ts-ignore
      this._directory = `${UNIT_TEST_DIR}/commonjs`;
      // @ts-ignore
      this._revert = dependencyTreeRewired.__set__('traverse', () => []);
    });

    afterEach(() => {
      // @ts-ignore
      this._revert();
    });

    it('throws if the filename is missing', () => {
      assert.throws(() => {
        dependencyTree({
          filename: undefined,
          // @ts-ignore
          directory: this._directory,
        });
      });
    });

    it('throws if the root is missing', () => {
      assert.throws(() => {
        dependencyTree({ filename: undefined });
      });
    });

    it('throws if a supplied filter is not a function', () => {
      assert.throws(() => {
        const directory = `${UNIT_TEST_DIR}/onlyRealDeps`;
        const filename = `${directory}/a.js`;

        dependencyTree({
          filename,
          directory,
          filter: 'foobar',
        });
      });
    });

    it('does not throw on the legacy `root` option', () => {
      assert.doesNotThrow(() => {
        const directory = `${UNIT_TEST_DIR}/onlyRealDeps`;
        const filename = `${directory}/a.js`;

        dependencyTree({
          filename,
          root: directory,
        });
      });
    });
  });

  describe('on file error', () => {
    beforeEach(() => {
      // @ts-ignore
      this._directory = `${UNIT_TEST_DIR}/commonjs`;
    });

    it('does not throw', () => {
      assert.doesNotThrow(() => {
        dependencyTree({
          filename: 'foo',
          // @ts-ignore
          directory: this._directory,
        });
      });
    });

    it('returns no dependencies', () => {
      // @ts-ignore
      const tree = dependencyTree({ filename: 'foo', directory: this._directory });
      assert(!tree.length);
    });
  });

  describe('memoization (#2)', () => {
    beforeEach(() => {
      // @ts-ignore
      this._spy = sinon.spy(dependencyTreeRewired, '_getDependencies');
    });

    afterEach(() => {
      dependencyTreeRewired._getDependencies.restore();
    });

    it('returns the precomputed list of a cached entry point', () => {
      const filename = `${UNIT_TEST_DIR}/amd/a.js`;
      const directory = `${UNIT_TEST_DIR}/amd`;

      const cache = {
        // Shouldn't process the first file's tree
        [filename]: { pathMap: { dependencies: [] } },
      };

      const tree = dependencyTree({
        filename,
        directory,
        visited: cache,
      });

      assert(!tree.length);
    });
  });

  describe('module formats', () => {
    describe('commonjs', () => {
      beforeEach(() => {
        // @ts-ignore
        this._directory = path.normalize(`${UNIT_TEST_DIR}/es6`);
        mockcommonjs();
      });

      testTreesForFormat('commonjs');
    });

    describe('es6', () => {
      beforeEach(() => {
        // @ts-ignore
        this._directory = path.normalize(`${UNIT_TEST_DIR}/es6`);
        mockes6();
      });

      testTreesForFormat('es6');

      it('resolves files that have jsx', () => {
        // @ts-ignore
        const filename = path.normalize(`${this._directory}/jsx.js`);
        const tree = dependencyTree({
          filename,
          // @ts-ignore
          directory: this._directory,
        });
        // @ts-ignore
        assert.ok(tree[filename].includes(path.normalize(`${this._directory}/c.js`)));
      });

      it('resolves files with a jsx extension', () => {
        // @ts-ignore
        const filename = path.normalize(`${this._directory}/foo.jsx`);
        const tree = dependencyTree({
          filename,
          // @ts-ignore
          directory: this._directory,
        });
        // @ts-ignore
        assert.ok(tree[filename].includes(path.normalize(`${this._directory}/b.js`)));
      });

      it('resolves files that have es7', () => {
        // @ts-ignore
        const filename = path.normalize(`${this._directory}/es7.js`);
        const tree = dependencyTree({
          filename,
          // @ts-ignore
          directory: this._directory,
        });
        // @ts-ignore
        assert.ok(tree[filename].includes(path.normalize(`${this._directory}/c.js`)));
      });
    });

    describe('sass', () => {
      beforeEach(() => {
        mockSass();
      });

      testTreesForFormat('sass', '.scss');
    });

    describe('stylus', () => {
      beforeEach(() => {
        mockStylus();
      });

      testTreesForFormat('stylus', '.styl');
    });

    describe('less', () => {
      beforeEach(() => {
        mockLess();
      });

      testTreesForFormat('less', '.less');
    });

    describe('typescript', () => {
      beforeEach(() => {
        mockTS();
      });

      testTreesForFormat('ts', '.ts');
    });
  });

  // skipping the webpack unit tests for now as it's not easy to wire up all the files together.
  // originally, in dependency-tree, the webpack.config.js is in the same directory of the index.js.
  // doing the same here will be confusing. instead, we have already e2e-tests in bit legacy of custom
  // module resolution, which takes advantage of the webpack config.
  describe.skip('webpack', () => {
    beforeEach(() => {
      // Note: not mocking because webpack's resolver needs a real project with dependencies;
      // otherwise, we'd have to mock a ton of files.
      // @ts-ignore
      this._root = path.join(UNIT_TEST_DIR, '../');
      // @ts-ignore
      this._webpackConfig = `${this._root}/webpack.config.js`;
      // @ts-ignore
      this._testResolution = (name) => {
        const results = dependencyTree.toList({
          filename: `${UNIT_TEST_DIR}/webpack/${name}.js`,
          // @ts-ignore
          directory: this._root,
          // @ts-ignore
          webpackConfig: this._webpackConfig,
          filter: (filename) => filename.indexOf('filing-cabinet') !== -1,
        });
        assert.ok(results.some((filename) => filename.indexOf('node_modules/filing-cabinet') !== -1));
      };
    });

    it('resolves unaliased modules', () => {
      // @ts-ignore
      this.timeout(5000);
      // @ts-ignore
      this._testResolution('unaliased');
    });
  });

  describe('when a filter function is supplied', () => {
    it('uses the filter to determine if a file should be included in the results', () => {
      const directory = path.normalize(`${fixtures}/onlyRealDeps`);
      const filename = path.normalize(`${directory}/a.js`);

      const tree = dependencyTree({
        filename,
        directory,
        // Skip all 3rd party deps
        filter: (filePath, moduleFile) => {
          assert.ok(require.resolve('debug'));
          assert.ok(moduleFile.includes(path.normalize('onlyRealDeps/a.js')));
          return filePath.indexOf('node_modules') === -1;
        },
      });

      const subTree = tree[filename];
      assert.ok(Object.keys(tree).length);

      const has3rdPartyDep = Object.keys(subTree).some((dep) => dep === require.resolve('debug'));
      assert.ok(!has3rdPartyDep);
    });
  });

  describe('when given a CJS file with lazy requires', () => {
    beforeEach(() => {
      mockfs({
        [`${UNIT_TEST_DIR}/cjs`]: {
          'foo.js': 'module.exports = function(bar = require("./bar")) {};',
          'bar.js': 'module.exports = 1;',
        },
      });
    });

    it('includes the lazy dependency', () => {
      const directory = `${UNIT_TEST_DIR}/cjs`;
      const filename = path.normalize(`${directory}/foo.js`);

      const tree = dependencyTree({ filename, directory });
      assert.ok(tree[filename].includes(path.normalize(`${directory}/bar.js`)));
    });
  });

  describe('when given an es6 file using CJS lazy requires', () => {
    beforeEach(() => {
      mockfs({
        [`${UNIT_TEST_DIR}/es6`]: {
          'foo.js': 'export default function(bar = require("./bar")) {};',
          'bar.js': 'export default 1;',
        },
      });
    });

    describe('and mixedImport mode is turned on', () => {
      it('includes the lazy dependency', () => {
        const directory = `${UNIT_TEST_DIR}/es6`;
        const filename = path.normalize(`${directory}/foo.js`);

        const tree = dependencyTree({
          filename,
          directory,
          detective: {
            es6: {
              mixedImports: true,
            },
          },
        });

        assert.ok(tree[filename].includes(path.normalize(`${directory}/bar.js`)));
      });
    });
  });

  describe('when given an es6 file using dynamic imports', () => {
    beforeEach(() => {
      mockfs({
        [`${UNIT_TEST_DIR}/es6`]: {
          'foo.js': 'import("./bar");',
          'bar.js': 'export default 1;',
        },
      });
    });

    it('includes the dynamic import', () => {
      const directory = path.normalize(`${UNIT_TEST_DIR}/es6`);
      const filename = path.normalize(`${directory}/foo.js`);

      const tree = dependencyTree({
        filename,
        directory,
      });

      const subTree = tree[filename];

      assert.ok(!(`${directory}/bar.js` in subTree));
    });
  });

  describe('when a dependency of the main file is not supported', () => {
    beforeEach(() => {
      mockfs({
        [`${UNIT_TEST_DIR}/baz`]: {
          'foo.js': 'require("./bar.json");',
          'bar.json': '{ "main": "I\'m a simple JSON object" }',
        },
      });
    });

    it('should include it as a dependency and not throw an error', () => {
      const directory = path.normalize(`${UNIT_TEST_DIR}/baz`);
      const filename = path.normalize(`${directory}/foo.js`);

      const tree = dependencyTree({
        filename,
        directory,
      });

      assert.ok(`${directory}/bar.json` in tree);
    });
  });

  // nodeModulesConfig is a feature added to dependency-tree and filing-cabinet to support
  // "module" attribute of package.json, see here what this attribute is good for:
  // https://github.com/rollup/rollup/wiki/pkg.module
  // the commit of supporting it in filing-cabinet is here: https://github.com/dependents/node-filing-cabinet/commit/abef861a5a725b29c2342d01de94c6e2dd881aa0
  describe.skip('when given a CJS file with module property in package.json', () => {
    beforeEach(() => {
      mockfs({
        [`${UNIT_TEST_DIR}/es6`]: {
          'module.entry.js': 'import * as module from "module.entry"',
          node_modules: {
            'module.entry': {
              'index.main.js': 'module.exports = () => {};',
              'index.module.js': 'module.exports = () => {};',
              'package.json': '{ "main": "index.main.js", "module": "index.module.js" }',
            },
          },
        },
      });
    });

    it('it includes the module entry as dependency', () => {
      const directory = `${UNIT_TEST_DIR}/es6`;
      const filename = `${directory}/module.entry.js`;

      const tree = dependencyTree({
        filename,
        directory,
        nodeModulesConfig: {
          entry: 'module',
        },
      });
      const subTree = tree[filename];

      assert.ok(`${directory}/node_modules/module.entry/index.module.js` in subTree);
    });
  });

  describe('Config', () => {
    describe('when cloning', () => {
      describe('and a detective config was set', () => {
        it('retains the detective config in the clone', () => {
          const detectiveConfig = {
            es6: {
              mixedImports: true,
            },
          };

          const config = new Config({
            detectiveConfig,
            filename: 'foo',
            directory: 'bar',
          });

          const clone = config.clone();

          assert.deepEqual(clone.detectiveConfig, detectiveConfig);
        });
      });
    });
  });

  describe('when a dependency has missing packages and is retrieved from the cache (visited)', () => {
    beforeEach(() => {
      mockfs({
        [`${UNIT_TEST_DIR}/baz`]: {
          'foo.js': 'require("non-exist-foo-pkg");',
          'bar.js': 'require("./foo"); require("non-exist-bar-pkg")',
          'baz.js': 'require("./foo"); require("./bar"); require("non-exist-baz-pkg")',
        },
      });
    });

    it('should not override the cache with wrong packages', () => {
      const directory = path.normalize(`${UNIT_TEST_DIR}/baz`);
      const fooFile = path.normalize(`${directory}/foo.js`);
      const barFile = path.normalize(`${directory}/bar.js`);
      const bazFile = path.normalize(`${directory}/baz.js`);
      const nonExistent = {};
      const config = {
        directory,
        nonExistent,
        visited: {},
      };

      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      config.filename = fooFile;
      dependencyTree(config);
      expect(nonExistent[fooFile]).to.deep.equal(['non-exist-foo-pkg']);

      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      config.filename = barFile;
      dependencyTree(config);
      expect(nonExistent[fooFile]).to.deep.equal(['non-exist-foo-pkg']);
      expect(nonExistent[barFile]).to.deep.equal(['non-exist-bar-pkg']);

      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      config.filename = bazFile;
      dependencyTree(config);
      expect(nonExistent[fooFile]).to.deep.equal(['non-exist-foo-pkg']);
      expect(nonExistent[barFile]).to.deep.equal(['non-exist-bar-pkg']);
      expect(nonExistent[bazFile]).to.deep.equal(['non-exist-baz-pkg']);
    });
  });
  describe('passing css files and then javascript files', () => {
    beforeEach(() => {
      mockfs({
        [`${UNIT_TEST_DIR}/baz`]: {
          'base.scss': 'li {} a {}', // don't change the content. it crash only with this for some reason
          'index.jsx': "require('some-module');",
        },
      });
    });
    it('should not crash with "RangeError: Maximum call stack size exceeded" error', () => {
      const directory = path.normalize(`${UNIT_TEST_DIR}/baz`);
      const baseFile = path.normalize(`${directory}/base.scss`);
      const indexFile = path.normalize(`${directory}/index.jsx`);
      const config = {
        directory,
      };

      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      config.filename = baseFile;
      dependencyTree(config);

      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      config.filename = indexFile;
      const dependencies = dependencyTree(config);
      expect(dependencies).to.be.ok;
    });
  });
  describe('files with dynamic import', () => {
    it('should not show missing dependencies', () => {
      mockfs({
        [`${UNIT_TEST_DIR}/dynamic`]: {
          'foo.js': 'const a = "./b"; import(a); require(a);',
        },
      });
      const directory = path.normalize(`${UNIT_TEST_DIR}/dynamic`);
      const filename = path.normalize(`${directory}/foo.js`);
      const visited = {};

      dependencyTree({
        filename,
        directory,
        visited,
      });
      expect(visited[filename].missing).to.be.undefined;
    });
  });
  describe('files with import from cdn (http, https)', () => {
    it('should not show missing dependencies when importing from https', () => {
      mockfs({
        [`${UNIT_TEST_DIR}/cdn`]: {
          'foo.js': 'import { a } from "https://unpkg.com";',
        },
      });
      const directory = path.normalize(`${UNIT_TEST_DIR}/cdn`);
      const filename = path.normalize(`${directory}/foo.js`);
      const visited = {};
      dependencyTree({
        filename,
        directory,
        visited,
      });
      expect(visited[filename].missing).to.be.undefined;
    });
    it('should not show missing dependencies when importing from http', () => {
      mockfs({
        [`${UNIT_TEST_DIR}/cdn`]: {
          'bar.js': 'const b = require("http://pkg.com");',
        },
      });
      const directory = path.normalize(`${UNIT_TEST_DIR}/cdn`);
      const filename = path.normalize(`${directory}/bar.js`);
      const visited = {};
      dependencyTree({
        filename,
        directory,
        visited,
      });
      expect(visited[filename].missing).to.be.undefined;
    });
  });
});
