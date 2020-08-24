import { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';

import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

describe('component that requires another component internal (not main) file', function () {
  this.timeout(0);
  let helper: Helper;
  let npmCiRegistry;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
    npmCiRegistry = new NpmCiRegistry(helper);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('without compiler (no dist)', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      npmCiRegistry.setCiScopeInBitJson();
      helper.fs.createFile('src/utils', 'is-type.js', '');
      helper.fs.createFile('src/utils', 'is-type-internal.js', fixtures.isType);
      helper.command.addComponent('src/utils/is-type.js src/utils/is-type-internal.js', {
        i: 'utils/is-type',
        m: 'src/utils/is-type.js',
      });

      const isStringFixture =
        "const isType = require('./is-type-internal');\n module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.fs.createFile('src/utils', 'is-string.js', '');
      helper.fs.createFile('src/utils', 'is-string-internal.js', isStringFixture);
      helper.command.addComponent('src/utils/is-string.js src/utils/is-string-internal.js', {
        i: 'utils/is-string',
        m: 'src/utils/is-string.js',
      });

      const barFooFixture =
        "const isString = require('../utils/is-string-internal');\n module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.fs.createFile('src/bar', 'foo.js', barFooFixture);
      helper.command.addComponent('src/bar/foo.js', { i: 'bar/foo', m: 'src/bar/foo.js' });
      helper.command.tagAllComponents();

      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
    });
    describe('when dependencies are saved as components', () => {
      before(() => {
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), fixtures.appPrintBarFoo);
      });
      it('should be able to require the main and the internal files and print the results', () => {
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
    (supportNpmCiRegistryTesting ? describe : describe.skip)('when dependencies are saved as packages', () => {
      before(async () => {
        await npmCiRegistry.init();
        helper.scopeHelper.removeRemoteScope();
        npmCiRegistry.publishComponent('utils/is-type');
        npmCiRegistry.publishComponent('utils/is-string');
        npmCiRegistry.publishComponent('bar/foo');

        helper.scopeHelper.reInitLocalScope();
        helper.command.runCmd('npm init -y');
        helper.command.runCmd(`npm install @ci/${helper.scopes.remote}.bar.foo`);
      });
      after(() => {
        npmCiRegistry.destroy();
      });
      it('should be able to require its direct dependency and print results from all dependencies', () => {
        const appJsFixture = `const barFoo = require('@ci/${helper.scopes.remote}.bar.foo'); console.log(barFoo());`;
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
  });
  describe('with compiler', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.scopeHelper.setRemoteScopeAsDifferentDir();
      helper.env.importCompiler();
      npmCiRegistry.setCiScopeInBitJson();
      helper.fs.createFile('src/utils', 'is-type.js', '');
      helper.fs.createFile('src/utils', 'is-type-internal.js', fixtures.isTypeES6);
      helper.command.addComponent('src/utils/is-type.js src/utils/is-type-internal.js', {
        i: 'utils/is-type',
        m: 'src/utils/is-type.js',
      });

      const isStringFixture =
        "import isType from './is-type-internal'; export default function isString() { return isType() +  ' and got is-string'; };";
      helper.fs.createFile('src/utils', 'is-string.js', '');
      helper.fs.createFile('src/utils', 'is-string-internal.js', isStringFixture);
      helper.command.addComponent('src/utils/is-string.js src/utils/is-string-internal.js', {
        i: 'utils/is-string',
        m: 'src/utils/is-string.js',
      });

      const barFooFixture =
        "import isString from '../utils/is-string-internal.js'; export default function foo() { return isString() + ' and got foo'; };";
      helper.fs.createFile('src/bar', 'foo.js', barFooFixture);
      helper.command.addComponent('src/bar/foo.js', { i: 'bar/foo', m: 'src/bar/foo.js' });
      helper.command.tagAllComponents();

      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
    });
    describe('when dependencies are saved as components', () => {
      before(() => {
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), fixtures.appPrintBarFooES6);
      });
      it('should be able to require the main and the internal files and print the results', () => {
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
    (supportNpmCiRegistryTesting ? describe : describe.skip)('when dependencies are saved as packages', () => {
      before(async () => {
        await npmCiRegistry.init();
        helper.scopeHelper.removeRemoteScope();
        npmCiRegistry.publishComponent('utils/is-type');
        npmCiRegistry.publishComponent('utils/is-string');
        npmCiRegistry.publishComponent('bar/foo');

        helper.scopeHelper.reInitLocalScope();
        helper.command.runCmd('npm init -y');
        helper.command.runCmd(`npm install @ci/${helper.scopes.remote}.bar.foo`);
      });
      after(() => {
        npmCiRegistry.destroy();
      });
      it('should be able to require its direct dependency and print results from all dependencies', () => {
        const appJsFixture = `const barFoo = require('@ci/${helper.scopes.remote}.bar.foo'); console.log(barFoo.default());`;
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
  });
  describe('with a bundler compiler (generates dists non parallel to the original files)', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('src/utils', 'is-type.js', '');
      helper.fs.createFile('src/utils', 'is-type-internal.js', fixtures.isType);
      helper.command.addComponent('src/utils/is-type.js src/utils/is-type-internal.js', {
        i: 'utils/is-type',
        m: 'src/utils/is-type.js',
      });

      const isStringFixture =
        "const isType = require('./is-type-internal');\n module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.fs.createFile('src/utils', 'is-string.js', isStringFixture);
      helper.command.addComponent('src/utils/is-string.js', { i: 'utils/is-string' });
      helper.env.importDummyCompiler('bundle');
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('utils/is-string');
    });
    it('should not try to generate the link to the non-exist internal file but to the main package', () => {
      const linkFile = helper.fs.readFile('components/utils/is-string/is-type-internal.js');
      expect(linkFile).to.not.have.string('is-type-internal');
      expect(linkFile).to.not.have.string('dist');
    });
  });
});
