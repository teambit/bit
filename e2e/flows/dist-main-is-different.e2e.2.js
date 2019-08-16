import path from 'path';
import fs from 'fs-extra';
import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));

/**
 * this test makes sure the compiler can specify a different main-file for the dists.
 * in order for the test to prove it, the source files print to the console "from source" and the
 * dist files are generated with an extra file with a suffix "-main" and the text "from source" is
 * replaced by "from dist". See the compiler at e2e/fixtures/compilers/dist-main/compiler.js
 */
describe('mainFile of the dist is different than the source', function () {
  this.timeout(0);
  const helper = new Helper();
  let npmCiRegistry;
  after(() => {
    helper.destroyEnv();
  });
  let afterImportingCompiler;
  before(() => {
    helper.setNewLocalAndRemoteScopes();
    npmCiRegistry = new NpmCiRegistry(helper);
    npmCiRegistry.setCiScopeInBitJson();
    helper.createFile(
      'src/utils',
      'is-type.js',
      "module.exports = function isType() { return 'got is-type from source'; };"
    );
    helper.addComponent('src/utils/is-type.js', { i: 'utils/is-type' });
    helper.createFile(
      'src/utils',
      'is-string.js',
      "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string from source'; };"
    );
    helper.addComponent('src/utils/is-string.js', { i: 'utils/is-string' });
    helper.createFile(
      'src/bar',
      'foo.js',
      "const isString = require('../utils/is-string.js'); module.exports = function foo() { return isString() + ' and got foo from source'; };"
    );
    helper.addComponent('src/bar/foo.js', { i: 'bar/foo' });
    helper.importDummyCompiler('dist-main');
    afterImportingCompiler = helper.cloneLocalScope();
  });
  describe('tagging the component', () => {
    before(() => {
      helper.tagAllComponents();
    });
    it('should save the mainDistFile to the scope', () => {
      const barFoo = helper.catComponent('bar/foo@latest');
      expect(barFoo).to.have.property('mainDistFile');
      expect(barFoo.mainDistFile).to.equal('src/bar/foo-main.js');
      expect(barFoo.mainDistFile).to.not.equal(barFoo.mainFile);
    });
    describe('export the component', () => {
      before(() => {
        // export v1 with relative paths
        helper.exportAllComponents();
        helper.createFile(
          'src/utils',
          'is-string.js',
          `const isType = require('@ci/${
            helper.remoteScope
          }.utils.is-type'); module.exports = function isString() { return isType() +  ' and got is-string from source'; };`
        );
        helper.createFile(
          'src/bar',
          'foo.js',
          `const isString = require('@ci/${
            helper.remoteScope
          }.utils.is-string'); module.exports = function foo() { return isString() + ' and got foo from source'; };`
        );
        helper.tagAllComponents();
        // export v2 with module paths
        helper.exportAllComponents();
      });
      it('should be able to require the component and its dependencies from the dist directory', () => {
        const appJsFixture = `const barFoo = require('@ci/${helper.remoteScope}.bar.foo'); console.log(barFoo());`;
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type from dist and got is-string from dist and got foo from dist');
      });
      describe('import to another workspace', () => {
        before(() => {
          helper.reInitLocalScope();
          npmCiRegistry.setCiScopeInBitJson();
          helper.addRemoteScope();
          helper.importComponent('bar/foo');
        });
        it('should be able to require the component and its dependencies using the main dist file', () => {
          const appJsFixture = `const barFoo = require('@ci/${helper.remoteScope}.bar.foo'); console.log(barFoo());`;
          fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type from dist and got is-string from dist and got foo from dist');
        });
      });
      describe('import to another workspace when dist is outside the components dir', () => {
        before(() => {
          helper.reInitLocalScope();
          npmCiRegistry.setCiScopeInBitJson();
          helper.addRemoteScope();
          helper.bitJson.modifyFieldInBitJson('dist', { target: 'dist' });
          helper.importComponent('bar/foo');
        });
        it('should be able to require the component and its dependencies using the main dist file', () => {
          const appJsFixture = `const barFoo = require('@ci/${helper.remoteScope}.bar.foo'); console.log(barFoo());`;
          fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type from dist and got is-string from dist and got foo from dist');
        });
      });
      (supportNpmCiRegistryTesting ? describe : describe.skip)('publishing to registry', () => {
        before(async () => {
          helper.reInitLocalScope();
          npmCiRegistry.setCiScopeInBitJson();
          helper.addRemoteScope();
          helper.importComponent('bar/foo@0.0.1');
          helper.importComponent('utils/is-type@0.0.1');
          helper.importComponent('utils/is-string@0.0.1');
          await npmCiRegistry.init();
          helper.importNpmPackExtension();
          helper.removeRemoteScope();
          npmCiRegistry.publishComponent('utils/is-type');
          npmCiRegistry.publishComponent('utils/is-string');
          npmCiRegistry.publishComponent('bar/foo');
        });
        after(() => {
          npmCiRegistry.destroy();
        });
        function runAppJs() {
          const appJsFixture = `const barFoo = require('@ci/${helper.remoteScope}.bar.foo'); console.log(barFoo());`;
          fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type from dist and got is-string from dist and got foo from dist');
        }
        describe('installing a component using NPM', () => {
          before(() => {
            helper.reInitLocalScope();
            helper.runCmd('npm init -y');
            helper.runCmd(`npm install @ci/${helper.remoteScope}.bar.foo`);
          });
          it('should be able to require its direct dependency and print results from all dependencies', () => {
            runAppJs();
          });
        });
        describe('importing a component using Bit', () => {
          before(() => {
            helper.reInitLocalScope();
            npmCiRegistry.setCiScopeInBitJson();
            npmCiRegistry.setResolver();
            helper.importComponent('bar/foo@0.0.1');
          });
          it('should be able to require its direct dependency and print results from all dependencies', () => {
            runAppJs();
          });
        });
      });
    });
  });
  describe('using the new compiler API', () => {
    before(() => {
      helper.getClonedLocalScope(afterImportingCompiler);
      helper.changeDummyCompilerCode('isNewAPI = false', 'isNewAPI = true');
      const output = helper.build();
      expect(output).to.have.string('using the new compiler API');
      helper.tagAllComponents();
    });
    it('should save the mainDistFile to the scope', () => {
      const barFoo = helper.catComponent('bar/foo@latest');
      expect(barFoo).to.have.property('mainDistFile');
      expect(barFoo.mainDistFile).to.equal('src/bar/foo-main.js');
      expect(barFoo.mainDistFile).to.not.equal(barFoo.mainFile);
    });
  });
});
