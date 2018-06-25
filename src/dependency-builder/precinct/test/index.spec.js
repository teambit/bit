var assert = require('assert');
var fs = require('fs');
var path = require('path');
var rewire = require('rewire');
var sinon = require('sinon');
var ast = require('./exampleAST');
var precinct = rewire('../');

function read(filename) {
  return fs.readFileSync(path.join(__dirname, filename), 'utf8');
}

describe('node-precinct', function() {
  it('accepts an AST', function() {
    var deps = precinct(ast);
    assert(deps.length === 1);
  });

  it('dangles off a given ast', function() {
    var deps = precinct(ast);
    assert.deepEqual(precinct.ast, ast);
  });

  it('dangles off the parsed ast from a .js file', function() {
    precinct(read('amd.js'));
    assert.ok(precinct.ast);
    assert.notDeepEqual(precinct.ast, ast);
  });

  it('dangles off the parsed ast from a scss detective', function() {
    precinct(read('styles.scss'), 'scss');
    assert.notDeepEqual(precinct.ast, {});
  });

  it('dangles off the parsed ast from a sass detective', function() {
    precinct(read('styles.sass'), 'sass');
    assert.notDeepEqual(precinct.ast, {});
  });

  it('grabs dependencies of amd modules', function() {
    var amd = precinct(read('amd.js'));
    assert(amd.indexOf('./a') !== -1);
    assert(amd.indexOf('./b') !== -1);
    assert(amd.length === 2);
  });

  it('grabs dependencies of commonjs modules', function() {
    var cjs  = precinct(read('commonjs.js'));
    assert(cjs.indexOf('./a') !== -1);
    assert(cjs.indexOf('./b') !== -1);
    assert(cjs.length === 2);
  });

  it('grabs dependencies of es6 modules', function() {
    var cjs  = precinct(read('es6.js'));
    assert(cjs.indexOf('lib') !== -1);
    assert(cjs.length === 1);
  });

  it('grabs dependencies of es6 modules with embedded jsx', function() {
    var cjs  = precinct(read('jsx.js'));
    assert(cjs.indexOf('lib') !== -1);
    assert(cjs.length === 1);
  });

  it('grabs dependencies of es6 modules with embedded es7', function() {
    var cjs  = precinct(read('es7.js'));
    assert(cjs.indexOf('lib') !== -1);
    assert(cjs.length === 1);
  });

  it('does not grabs dependencies of es6 modules with syntax errors', function() {
    var cjs  = precinct(read('es6WithError.js'));
    assert(cjs.length === 0);
  });

  it('grabs dependencies of css files', function() {
    var css = precinct(read('styles.css'), 'css');
    assert.deepEqual(css, ['foo.css', 'baz.css', 'bla.css', 'another.css']);
  });

  it('grabs dependencies of scss files', function() {
    var scss = precinct(read('styles.scss'), 'scss');
    assert.deepEqual(scss, ['_foo', 'baz.scss']);
  });

  it('grabs dependencies of sass files', function() {
    var sass = precinct(read('styles.sass'), 'sass');
    assert.deepEqual(sass, ['_foo']);
  });

  it('grabs dependencies of stylus files', function() {
    var result = precinct(read('styles.styl'), 'stylus');
    var expected = ['mystyles', 'styles2.styl', 'styles3.styl', 'styles4'];

    assert.deepEqual(result, expected);
  });

  it('grabs dependencies of less files', function() {
    var result = precinct(read('styles.less'), 'less');
    var expected = ['_foo', '_bar.css', 'baz.less'];

    assert.deepEqual(result, expected);
  });

  it('grabs dependencies of typescript files', function() {
    var result = precinct(read('typescript.ts'), 'ts');
    var expected = ['fs', 'lib', './bar', './my-module.js', './ZipCodeValidator'];

    assert.deepEqual(result, expected);
  });

  it('does not grabs dependencies of typescript modules with syntax errors', function() {
    var result = precinct(read('typescriptWithError.ts'));
    assert(result.length === 0);
  });

  it('supports the object form of type configuration', function() {
    var result = precinct(read('styles.styl'), {type: 'stylus'});
    var expected = ['mystyles', 'styles2.styl', 'styles3.styl', 'styles4'];

    assert.deepEqual(result, expected);
  });

  it('yields no dependencies for es6 modules with no imports', function() {
    var cjs = precinct(read('es6NoImport.js'));
    assert.equal(cjs.length, 0);
  });

  it('yields no dependencies for non-modules', function() {
    var none = precinct(read('none.js'));
    assert.equal(none.length, 0);
  });

  it('ignores unparsable .js files', function() {
    var cjs = precinct(read('unparseable.js'));

    assert(cjs.indexOf('lib') < 0);
    assert.equal(cjs.length, 0);
  });

  it('does not throw on unparsable .js files', function() {
    assert.doesNotThrow(function() {
      precinct(read('unparseable.js'));
    }, SyntaxError);
  });

  it('does not blow up when parsing a gruntfile #2', function() {
    assert.doesNotThrow(function() {
      precinct(read('Gruntfile.js'));
    });
  });

  describe('paperwork', function() {
    it('returns the dependencies for the given filepath', function() {
      assert.ok(precinct.paperwork(__dirname + '/es6.js').length);
      assert.ok(precinct.paperwork(__dirname + '/styles.scss').length);
      assert.ok(precinct.paperwork(__dirname + '/typescript.ts').length);
      assert.ok(precinct.paperwork(__dirname + '/styles.css').length);
    });

    it('throws if the file cannot be found', function() {
      assert.throws(function() {
        precinct.paperwork('foo');
      });
    });

    it('filters out core modules if options.includeCore is false', function() {
      var deps = precinct.paperwork(__dirname + '/coreModules.js', {
        includeCore: false
      });

      assert(!deps.length);
    });

    it('does not filter out core modules by default', function() {
      var deps = precinct.paperwork(__dirname + '/coreModules.js');
      assert(deps.length);
    });

    it('supports passing detective configuration', function() {
      var stub = sinon.stub().returns([]);
      var revert = precinct.__set__('detectiveAmd', stub);
      var config = {
        amd: {
          skipLazyLoaded: true
        }
      };

      var deps = precinct.paperwork(__dirname + '/amd.js', {
        includeCore: false,
        amd: config.amd
      });

      assert.deepEqual(stub.args[0][1], config.amd);
      revert();
    });

    describe('when given detective configuration', function() {
      it('still does not filter out core module by default', function() {
        var stub = sinon.stub().returns([]);
        var revert = precinct.__set__('precinct', stub);

        var deps = precinct.paperwork(__dirname + '/amd.js', {
          amd: {
            skipLazyLoaded: true
          }
        });

        assert.equal(stub.args[0][1].includeCore, true);
        revert();
      });
    });
  });

  describe('when given a configuration object', function() {
    it('passes amd config to the amd detective', function() {
      var stub = sinon.stub();
      var revert = precinct.__set__('detectiveAmd', stub);
      var config = {
        amd: {
          skipLazyLoaded: true
        }
      };

      precinct(read('amd.js'), config);

      assert.deepEqual(stub.args[0][1], config.amd);
      revert();
    });

    describe('that sets mixedImports for es6', function() {
      describe('for a file identified as es6', function() {
        it('returns both the commonjs and es6 dependencies', function() {
          var deps = precinct(read('es6MixedImport.js'), {
            es6: {
              mixedImports: true
            }
          });

          assert.equal(deps.length, 2);
        });
      });

      describe('for a file identified as cjs', function() {
        it('returns both the commonjs and es6 dependencies', function() {
          var deps = precinct(read('cjsMixedImport.js'), {
            es6: {
              mixedImports: true
            }
          });

          assert.equal(deps.length, 2);
        });
      });
    });
  });

  describe('when lazy exported dependencies in CJS', function() {
    it('grabs those lazy dependencies', function() {
      var cjs = precinct(read('cjsExportLazy.js'));

      assert.equal(cjs[0], './amd');
      assert.equal(cjs[1], './es6');
      assert.equal(cjs[2], './es7');
      assert.equal(cjs.length, 3);
    });
  });

  describe('when given an es6 file', function() {
    describe('that uses CJS imports for lazy dependencies', function() {
      describe('and mixedImport mode is turned on', function() {
        it('grabs the lazy imports', function() {
          var es6 = precinct(read('es6MixedExportLazy.js'), {
            es6: {
              mixedImports: true
            }
          });

          assert.equal(es6[0], './amd');
          assert.equal(es6[1], './es6');
          assert.equal(es6[2], './es7');
          assert.equal(es6.length, 3);
        });
      });

      describe('and mixedImport mode is turned off', function() {
        it('does not grab any imports', function() {
          var es6 = precinct(read('es6MixedExportLazy.js'));

          assert.equal(es6.length, 0);
        });
      });
    });
  });
});
