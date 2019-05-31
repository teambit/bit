const assert = require('assert');
const sinon = require('sinon');
const rewire = require('rewire');
const mock = require('mock-fs');
const path = require('path');

const cabinet = rewire('./');
const fixtures = `${__dirname}/../../../fixtures/filing-cabinet`;
const mockedFiles = require(`${fixtures}/mockedJSFiles`);
const mockAST = require(`${fixtures}/ast`);
const mockRootDir = path.join(__dirname, '..', '..', '..');

// needed for the lazy loading
require('resolve-dependency-path');
require('sass-lookup');
require('app-module-path');
require('module-definition');
require('module-lookup-amd');

describe('filing-cabinet', () => {
  describe('JavaScript', () => {
    beforeEach(() => {
      mock(mockedFiles);
    });

    afterEach(() => {
      mock.restore();
    });

    it('dangles off its supported file extensions', () => {
      assert.deepEqual(cabinet.supportedFileExtensions, [
        '.js',
        '.jsx',
        '.ts',
        '.tsx',
        '.scss',
        '.sass',
        '.styl',
        '.less',
        '.vue'
      ]);
    });

    it('uses a generic resolve for unsupported file extensions', () => {
      const resolvedFile = cabinet({
        partial: './bar',
        filename: 'js/commonjs/foo.baz',
        directory: 'js/commonjs/'
      });
      assert.ok(resolvedFile.endsWith('bar.baz'));
    });

    describe('when given an ast for a JS file', () => {
      it('reuses the ast when trying to determine the module type', () => {
        const ast = {};

        const result = cabinet({
          partial: './bar',
          filename: 'js/es6/foo.js',
          directory: 'js/es6/',
          ast
        });
        assert.ok(result.endsWith('es6/bar.js'));
      });

      it('resolves the partial successfully', () => {
        const result = cabinet({
          partial: './bar',
          filename: 'js/es6/foo.js',
          directory: 'js/es6/',
          ast: mockAST
        });
        assert.equal(result, path.join(mockRootDir, 'js/es6/bar.js'));
      });
    });

    describe('when not given an ast', () => {
      it('uses the filename to look for the module type', () => {
        const options = {
          partial: './bar',
          filename: 'js/es6/foo.js',
          directory: 'js/es6/'
        };

        const result = cabinet(options);
        assert.equal(result, path.join(mockRootDir, 'js/es6/bar.js'));
      });
    });

    describe('es6', () => {
      it('assumes commonjs for es6 modules with no requirejs/webpack config', () => {
        const stub = sinon.stub();
        const revert = cabinet.__set__('commonJSLookup', stub);

        cabinet({
          partial: './bar',
          filename: 'js/es6/foo.js',
          directory: 'js/es6/'
        });

        assert.ok(stub.called);

        revert();
      });

      it('assumes amd for es6 modules with a requirejs config', () => {
        const spy = sinon.spy(cabinet, '_getJSType');

        const result = cabinet({
          partial: './bar',
          filename: 'js/es6/foo.js',
          directory: 'js/es6/',
          config: {
            baseUrl: './'
          }
        });

        assert.ok(spy.called);
        assert.equal(result, path.normalize('js/es6/bar.js'));
        spy.restore();
      });
    });

    describe('jsx', () => {
      it('resolves files with the .jsx extension', () => {
        const result = cabinet({
          partial: './bar',
          filename: 'js/es6/foo.jsx',
          directory: 'js/es6/'
        });

        assert.equal(result, `${path.join(mockRootDir, 'js/es6/bar.js')}`);
      });
    });

    describe('amd', () => {
      it('uses the amd resolver', () => {
        const resolvedFile = cabinet({
          partial: './bar',
          filename: 'js/amd/foo.js',
          directory: 'js/amd/'
        });
        assert.ok(resolvedFile.endsWith('amd/bar.js'));
      });

      // skipped as part of lazy loading fix. not seems to be super helpful test
      it.skip('passes along arguments', () => {
        const stub = sinon.stub();
        const revert = cabinet.__set__('amdLookup', stub);
        const config = { baseUrl: 'js' };

        cabinet({
          partial: 'bar',
          config,
          configPath: 'config.js',
          filename: 'js/amd/foo.js',
          directory: 'js/amd/'
        });

        const args = stub.getCall(0).args[0];

        assert.equal(args.partial, 'bar');
        assert.equal(args.config, config);
        assert.equal(args.configPath, 'config.js');
        assert.equal(args.filename, 'js/amd/foo.js');
        assert.equal(args.directory, 'js/amd/');

        assert.ok(stub.called);

        revert();
      });
    });

    describe('commonjs', () => {
      it("uses require's resolver", () => {
        const stub = sinon.stub();
        const revert = cabinet.__set__('commonJSLookup', stub);

        cabinet({
          partial: './bar',
          filename: 'js/commonjs/foo.js',
          directory: 'js/commonjs/'
        });

        assert.ok(stub.called);

        revert();
      });

      it('returns an empty string for an unresolved module', () => {
        const result = cabinet({
          partial: 'foobar',
          filename: 'js/commonjs/foo.js',
          directory: 'js/commonjs/'
        });

        assert.equal(result, '');
      });

      it('adds the directory to the require resolution paths', () => {
        const directory = 'js/commonjs/';
        const result = cabinet({
          partial: 'foobar',
          filename: 'js/commonjs/foo.js',
          directory
        });

        assert.ok(
          require.main.paths.some(function (p) {
            return p.indexOf(path.normalize(directory)) !== -1;
          })
        );
      });

      it('resolves a relative partial about the filename', () => {
        const directory = 'js/commonjs/';
        const filename = `${directory}foo.js`;

        const result = cabinet({
          partial: './bar',
          filename,
          directory
        });

        assert.equal(result, path.join(path.resolve(directory), 'bar.js'));
      });

      it("resolves a .. partial to its parent directory's index.js file", () => {
        const directory = 'js/commonjs/';
        const filename = `${directory}subdir/module.js`;

        const result = cabinet({
          partial: '../',
          filename,
          directory
        });

        assert.equal(result, path.join(path.resolve(directory), 'index.js'));
      });

      // @todo: fix
      it.skip('resolves a partial within a directory outside of the given file', () => {
        const directory = 'js/commonjs/';
        const filename = `${directory}test/index.spec.js`;

        const result = cabinet({
          partial: 'subdir',
          filename,
          directory
        });

        assert.equal(result, path.join(path.resolve(directory), 'subdir/index.js'));
      });

      // @todo: fix
      it.skip('resolves a node module with module entry in package.json', () => {
        const directory = 'js/commonjs/';
        const filename = `${directory}module.entry.js`;

        const result = cabinet({
          partial: 'module.entry',
          filename,
          directory,
          nodeModulesConfig: {
            entry: 'module'
          }
        });

        assert.equal(
          result,
          path.join(path.resolve(directory), '..', 'node_modules', 'module.entry', 'index.module.js')
        );
      });

      it('resolves a nested module', () => {
        const directory = 'js/node_modules/nested/';
        const filename = `${directory}index.js`;

        const result = cabinet({
          partial: 'lodash.assign',
          filename,
          directory
        });

        assert.equal(result, path.join(path.resolve(directory), 'node_modules', 'lodash.assign', 'index.js'));
      });

      it('resolves to the index.js file of a directory', () => {
        const directory = 'js/withIndex';
        const filename = `${directory}/index.js`;

        const result = cabinet({
          partial: './subdir',
          filename,
          directory
        });

        assert.equal(result, path.normalize(`${path.resolve(directory)}/subdir/index.js`));
      });

      it('resolves implicit .jsx requires', () => {
        const result = cabinet({
          partial: './bar',
          filename: 'js/cjs/foo.js',
          directory: 'js/cjs/'
        });

        assert.equal(result, `${path.join(mockRootDir, 'js/cjs/bar.jsx')}`);
      });

      it('resolves implicit .scss requires', () => {
        const result = cabinet({
          partial: './baz',
          filename: 'js/cjs/foo.js',
          directory: 'js/cjs/'
        });

        assert.equal(result, `${path.join(mockRootDir, 'js/cjs/baz.scss')}`);
      });

      it('resolves implicit .json requires', () => {
        const result = cabinet({
          partial: './pkg',
          filename: 'js/cjs/foo.js',
          directory: 'js/cjs/'
        });

        assert.equal(result, `${path.join(mockRootDir, 'js/cjs/pkg.json')}`);
      });
    });

    describe('typescript', () => {
      it('resolves an import', () => {
        const directory = 'js/ts';
        const filename = `${directory}/index.ts`;

        const result = cabinet({
          partial: './foo',
          filename,
          directory
        });

        assert.equal(result, path.join(path.resolve(directory), 'foo.ts'));
      });

      describe('when a partial does not exist', () => {
        it('returns an empty result', () => {
          const directory = 'js/ts';
          const filename = `${directory}/index.ts`;

          const result = cabinet({
            partial: './barbar',
            filename,
            directory
          });

          assert.equal(result, '');
        });
      });
    });
  });

  describe('CSS', () => {
    beforeEach(() => {
      mock({
        stylus: {
          'foo.styl': '',
          'bar.styl': ''
        },
        sass: {
          'foo.scss': '',
          'bar.scss': '',
          'foo.sass': '',
          'bar.sass': ''
        },
        less: {
          'foo.less': '',
          'bar.less': '',
          'bar.css': ''
        }
      });

      // mockJSDir = path.resolve(__dirname, '../');
    });

    afterEach(() => {
      mock.restore();
    });

    describe('sass', () => {
      it('uses the sass resolver for .scss files', () => {
        const result = cabinet({
          partial: 'bar',
          filename: 'sass/foo.scss',
          directory: 'sass/'
        });

        assert.equal(result, path.normalize(`${mockRootDir}/sass/bar.scss`));
      });

      it('uses the sass resolver for .sass files', () => {
        const result = cabinet({
          partial: 'bar',
          filename: 'sass/foo.sass',
          directory: 'sass/'
        });

        assert.equal(result, path.normalize(`${mockRootDir}/sass/bar.sass`));
      });
    });

    describe('stylus', () => {
      it('uses the stylus resolver', () => {
        const result = cabinet({
          partial: 'bar',
          filename: 'stylus/foo.styl',
          directory: 'stylus/'
        });

        assert.equal(result, path.normalize(`${mockRootDir}/stylus/bar.styl`));
      });
    });

    describe('less', () => {
      it('resolves extensionless partials', () => {
        const result = cabinet({
          partial: 'bar',
          filename: 'less/foo.less',
          directory: 'less/'
        });

        assert.equal(result, path.normalize(`${mockRootDir}/less/bar.less`));
      });

      it('resolves partials with a less extension', () => {
        const result = cabinet({
          partial: 'bar.less',
          filename: 'less/foo.less',
          directory: 'less/'
        });

        assert.equal(result, path.normalize(`${mockRootDir}/less/bar.less`));
      });

      it('resolves partials with a css extension', () => {
        const result = cabinet({
          partial: 'bar.css',
          filename: 'less/foo.less',
          directory: 'less/'
        });

        assert.equal(result, path.normalize(`${mockRootDir}/less/bar.css`));
      });
    });
  });

  describe('unrecognized extension', () => {
    it('uses a generic resolve for unsupported file extensions', () => {
      const result = cabinet({
        partial: './bar',
        filename: 'barbazim/foo.baz',
        directory: 'barbazim/'
      });

      assert.equal(result, path.normalize(`${mockRootDir}/barbazim/bar.baz`));
    });
  });

  describe('.register', () => {
    it('registers a custom resolver for a given extension', () => {
      const stub = sinon.stub().returns('foo.foobar');
      cabinet.register('.foobar', stub);

      const path = cabinet({
        partial: './bar',
        filename: 'js/amd/foo.foobar',
        directory: 'js/amd/'
      });

      assert.ok(stub.called);
      assert.equal(path, 'foo.foobar');
    });

    it('allows does not break default resolvers', () => {
      mock({
        stylus: {
          'foo.styl': '',
          'bar.styl': ''
        }
      });

      const stub = sinon.stub().returns('foo');

      cabinet.register('.foobar', stub);

      cabinet({
        partial: './bar',
        filename: 'js/amd/foo.foobar',
        directory: 'js/amd/'
      });

      const result = cabinet({
        partial: './bar',
        filename: 'stylus/foo.styl',
        directory: 'stylus/'
      });

      assert.ok(stub.called);
      assert.ok(result);

      mock.restore();
    });

    it('can be called multiple times', () => {
      const stub = sinon.stub().returns('foo');
      const stub2 = sinon.stub().returns('foo');

      cabinet.register('.foobar', stub);
      cabinet.register('.barbar', stub2);

      cabinet({
        partial: './bar',
        filename: 'js/amd/foo.foobar',
        directory: 'js/amd/'
      });

      cabinet({
        partial: './bar',
        filename: 'js/amd/foo.barbar',
        directory: 'js/amd/'
      });

      assert.ok(stub.called);
      assert.ok(stub2.called);
    });

    it('does not add redundant extensions to supportedFileExtensions', () => {
      const stub = sinon.stub;
      const newExt = '.foobar';

      cabinet.register(newExt, stub);
      cabinet.register(newExt, stub);

      const { supportedFileExtensions } = cabinet;

      assert.equal(supportedFileExtensions.indexOf(newExt), supportedFileExtensions.lastIndexOf(newExt));
    });
  });

  describe('.scss with a dependency prefix with a tilda', () => {
    it('should resolve the dependency to a node_module package (using webpack under the hood)', () => {
      const result = cabinet({
        partial: '~bootstrap/index',
        filename: `${fixtures}/foo.scss`,
        directory: fixtures
      });

      assert.equal(result, path.resolve(`${fixtures}/node_modules/bootstrap/index.scss`));
    });
  });
  describe('.scss with a dependency prefix with a tilda and resolve config', () => {
    describe('when the alias in resolve-config is resolved to an existing file', () => {
      it('should resolve the dependency according to the resolve-config', () => {
        const resolveConfig = { aliases: { '~bootstrap': path.normalize(fixtures) } };
        const result = cabinet({
          resolveConfig,
          partial: '~bootstrap/foo2',
          filename: `${fixtures}/foo.scss`,
          directory: fixtures
        });

        assert.equal(result, path.resolve(`${fixtures}/foo2.scss`));
      });
    });
    describe('when the alias in resolve-config does not match the partial', () => {
      it('should fallback to the node-module resolution', () => {
        const resolveConfig = { aliases: { '~non-exist': 'some-dir' } };
        const result = cabinet({
          resolveConfig,
          partial: '~bootstrap/index',
          filename: `${fixtures}/foo.scss`,
          directory: fixtures
        });

        assert.equal(result, path.resolve(`${fixtures}/node_modules/bootstrap/index.scss`));
      });
    });
  });

  // @todo: fix.
  describe.skip('webpack', () => {
    let directory;

    beforeEach(() => {
      directory = path.resolve(__dirname, '../../../');
    });

    function testResolution(partial, expected) {
      const resolved = cabinet({
        partial,
        filename: `${__dirname}/index.js`,
        directory,
        webpackConfig: `${fixtures}/webpack.config.js`
      });

      assert.equal(resolved, path.normalize(expected));
    }

    it('resolves an aliased path', () => {
      testResolution('R', `${directory}/node_modules/resolve/index.js`);
    });

    it('resolves a non-aliased path', () => {
      testResolution('resolve', `${directory}/node_modules/resolve/index.js`);
    });

    it('resolves a relative path', () => {
      testResolution('./test/ast', `${fixtures}/test/ast.js`);
    });

    it('resolves an absolute path from a file within a subdirectory', () => {
      const resolved = cabinet({
        partial: 'R',
        filename: `${fixtures}/test/ast.js`,
        directory,
        webpackConfig: `${fixtures}/webpack.config.js`
      });

      assert.equal(resolved, `${directory}/node_modules/resolve/index.js`);
    });

    it('resolves a path using resolve.root', () => {
      const resolved = cabinet({
        partial: 'mod1',
        filename: `${directory}/index.js`,
        directory,
        webpackConfig: `${directory}/webpack-root.config.js`
      });

      assert.equal(resolved, `${directory}/test/root1/mod1.js`);
    });

    it('resolves NPM module when using resolve.root', () => {
      const resolved = cabinet({
        partial: 'resolve',
        filename: `${directory}/index.js`,
        directory,
        webpackConfig: `${directory}/webpack-root.config.js`
      });

      assert.equal(resolved, `${directory}/node_modules/resolve/index.js`);
    });

    it('resolves NPM module when using resolve.modulesDirectories', () => {
      const resolved = cabinet({
        partial: 'resolve',
        filename: `${directory}/index.js`,
        directory,
        webpackConfig: `${directory}/webpack-root.config.js`
      });

      assert.equal(resolved, `${directory}/node_modules/resolve/index.js`);
    });

    it('resolves a path using resolve.modulesDirectories', () => {
      const resolved = cabinet({
        partial: 'mod2',
        filename: `${directory}/index.js`,
        directory,
        webpackConfig: `${directory}/webpack-root.config.js`
      });

      assert.equal(resolved, `${directory}/test/root2/mod2.js`);
    });

    it('resolves a path using webpack config that exports a function', () => {
      const resolved = cabinet({
        partial: 'R',
        filename: `${directory}/index.js`,
        directory,
        webpackConfig: `${directory}/webpack-env.config.js`
      });

      assert.equal(resolved, `${directory}/node_modules/resolve/index.js`);
    });

    it('resolves files with a .jsx extension', () => {
      testResolution('./test/foo.jsx', `${directory}/test/foo.jsx`);
    });

    describe('when the partial contains a loader', () => {
      it('still works', () => {
        testResolution('hgn!resolve', `${directory}/node_modules/resolve/index.js`);
      });
    });
  });
});
