import path from 'path';
import fs from 'fs-extra';
import chai, { expect } from 'chai';
import Helper from '../e2e-helper';

chai.use(require('chai-fs'));

describe('mainFile of the dist is different than the source', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  before(() => {
    helper.setNewLocalAndRemoteScopes();
    helper.createFile(
      'utils',
      'is-type.js',
      "module.exports = function isType() { return 'got is-type from source'; };"
    );
    helper.addComponentUtilsIsType();
    helper.createFile(
      'utils',
      'is-string.js',
      "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string from source'; };"
    );
    helper.addComponentUtilsIsString();
    helper.createComponentBarFoo(
      "const isString = require('../utils/is-string.js'); module.exports = function foo() { return isString() + ' and got foo from source'; };"
    );
    helper.addComponentBarFoo();
    helper.importDummyCompiler('dist-main');
  });
  describe('tagging the component', () => {
    before(() => {
      helper.tagAllComponents();
    });
    it('should save the mainDistFile to the scope', () => {
      const barFoo = helper.catComponent('bar/foo@latest');
      expect(barFoo).to.have.property('mainDistFile');
      expect(barFoo.mainDistFile).to.equal('bar/foo-main.js');
      expect(barFoo.mainDistFile).to.not.equal(barFoo.mainFile);
    });
    describe('export the component', () => {
      before(() => {
        helper.exportAllComponents();
        helper.createFile(
          'utils',
          'is-string.js',
          `const isType = require('@bit/${
            helper.remoteScope
          }.utils.is-type'); module.exports = function isString() { return isType() +  ' and got is-string from source'; };`
        );
        helper.createComponentBarFoo(
          `const isString = require('@bit/${
            helper.remoteScope
          }.utils.is-string'); module.exports = function foo() { return isString() + ' and got foo from source'; };`
        );
        helper.tagAllComponents();
        helper.exportAllComponents();
      });
      it('should be able to require the component and its dependencies from the dist directory', () => {
        const appJsFixture = `const barFoo = require('@bit/${helper.remoteScope}.bar.foo'); console.log(barFoo());`;
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type from dist and got is-string from dist and got foo from dist');
      });
      describe('import to another workspace', () => {
        before(() => {
          helper.reInitLocalScope();
          helper.addRemoteScope();
          helper.importComponent('bar/foo');
        });
        it('should be able to require the component and its dependencies using the main dist file', () => {
          const appJsFixture = `const barFoo = require('@bit/${helper.remoteScope}.bar.foo'); console.log(barFoo());`;
          fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type from dist and got is-string from dist and got foo from dist');
        });
      });
    });
  });
});
