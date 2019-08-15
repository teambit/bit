import { expect } from 'chai';
import path from 'path';
import fs from 'fs-extra';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../fixtures/fixtures';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

describe('component that requires another component internal (not main) file', function () {
  this.timeout(0);
  const helper = new Helper();
  const npmCiRegistry = new NpmCiRegistry(helper);
  after(() => {
    helper.destroyEnv();
  });
  describe('without compiler (no dist)', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      npmCiRegistry.setCiScopeInBitJson();
      helper.createFile('src/utils', 'is-type.js', '');
      helper.createFile('src/utils', 'is-type-internal.js', fixtures.isType);
      helper.addComponent('src/utils/is-type.js src/utils/is-type-internal.js', {
        i: 'utils/is-type',
        m: 'src/utils/is-type.js'
      });

      const isStringFixture =
        "const isType = require('./is-type-internal');\n module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createFile('src/utils', 'is-string.js', '');
      helper.createFile('src/utils', 'is-string-internal.js', isStringFixture);
      helper.addComponent('src/utils/is-string.js src/utils/is-string-internal.js', {
        i: 'utils/is-string',
        m: 'src/utils/is-string.js'
      });

      const barFooFixture =
        "const isString = require('../utils/is-string-internal');\n module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.createFile('src/bar', 'foo.js', barFooFixture);
      helper.addComponent('src/bar/foo.js', { i: 'bar/foo', m: 'src/bar/foo.js' });
      helper.tagAllComponents();

      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
    });
    describe('when dependencies are saved as components', () => {
      before(() => {
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), fixtures.appPrintBarFoo);
      });
      it('should be able to require the main and the internal files and print the results', () => {
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
    (supportNpmCiRegistryTesting ? describe : describe.skip)('when dependencies are saved as packages', () => {
      before(async () => {
        await npmCiRegistry.init();
        helper.importNpmPackExtension();
        helper.removeRemoteScope();
        npmCiRegistry.publishComponent('utils/is-type');
        npmCiRegistry.publishComponent('utils/is-string');
        npmCiRegistry.publishComponent('bar/foo');

        helper.reInitLocalScope();
        helper.runCmd('npm init -y');
        helper.runCmd(`npm install @ci/${helper.remoteScope}.bar.foo`);
      });
      after(() => {
        npmCiRegistry.destroy();
      });
      it('should be able to require its direct dependency and print results from all dependencies', () => {
        const appJsFixture = `const barFoo = require('@ci/${helper.remoteScope}.bar.foo'); console.log(barFoo());`;
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
  });
  describe('with compiler', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.setRemoteScopeAsDifferentDir();
      helper.importCompiler();
      npmCiRegistry.setCiScopeInBitJson();
      helper.createFile('src/utils', 'is-type.js', '');
      helper.createFile('src/utils', 'is-type-internal.js', fixtures.isTypeES6);
      helper.addComponent('src/utils/is-type.js src/utils/is-type-internal.js', {
        i: 'utils/is-type',
        m: 'src/utils/is-type.js'
      });

      const isStringFixture =
        "import isType from './is-type-internal'; export default function isString() { return isType() +  ' and got is-string'; };";
      helper.createFile('src/utils', 'is-string.js', '');
      helper.createFile('src/utils', 'is-string-internal.js', isStringFixture);
      helper.addComponent('src/utils/is-string.js src/utils/is-string-internal.js', {
        i: 'utils/is-string',
        m: 'src/utils/is-string.js'
      });

      const barFooFixture =
        "import isString from '../utils/is-string-internal.js'; export default function foo() { return isString() + ' and got foo'; };";
      helper.createFile('src/bar', 'foo.js', barFooFixture);
      helper.addComponent('src/bar/foo.js', { i: 'bar/foo', m: 'src/bar/foo.js' });
      helper.tagAllComponents();

      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
    });
    describe('when dependencies are saved as components', () => {
      before(() => {
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), fixtures.appPrintBarFooES6);
      });
      it('should be able to require the main and the internal files and print the results', () => {
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
    (supportNpmCiRegistryTesting ? describe : describe.skip)('when dependencies are saved as packages', () => {
      before(async () => {
        await npmCiRegistry.init();
        helper.importNpmPackExtension();
        helper.removeRemoteScope();
        npmCiRegistry.publishComponent('utils/is-type');
        npmCiRegistry.publishComponent('utils/is-string');
        npmCiRegistry.publishComponent('bar/foo');

        helper.reInitLocalScope();
        helper.runCmd('npm init -y');
        helper.runCmd(`npm install @ci/${helper.remoteScope}.bar.foo`);
      });
      after(() => {
        npmCiRegistry.destroy();
      });
      it('should be able to require its direct dependency and print results from all dependencies', () => {
        const appJsFixture = `const barFoo = require('@ci/${
          helper.remoteScope
        }.bar.foo'); console.log(barFoo.default());`;
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
  });
});
