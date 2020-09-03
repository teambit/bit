import { expect } from 'chai';

import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';

const fileSpecFixture = (testShouldPass) => `const expect = require('chai').expect;
const comp = require('./file');

describe('comp', () => {
  it('should display "comp level0 level1"', () => {
    expect(comp())${testShouldPass ? '' : '.not'}.to.equal('comp level0 level1');
  });
});`;

describe('bit ci-update', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('component with tester and nested dependencies', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.env.importTester();
      const level1Fixture = "module.exports = function level1() { return 'level1'; };";
      helper.fs.createFile('', 'level1.js', level1Fixture);
      const level0Fixture =
        "var level1 = require('./level1'); module.exports = function level0() { return 'level0 ' + level1(); };";
      helper.fs.createFile('', 'level0.js', level0Fixture);
      helper.command.addComponent('level0.js', { i: 'dep/level0' });
      helper.command.addComponent('level1.js', { i: 'dep/level1' });
      const fileFixture =
        "var level0 = require('./level0'); module.exports = function comp() { return 'comp ' + level0()};";
      helper.fs.createFile('', 'file.js', fileFixture);
      helper.fs.createFile('', 'file.spec.js', fileSpecFixture(true));
      helper.npm.installNpmPackage('chai', '4.1.2');
      helper.command.addComponent('file.js', { i: 'comp/comp', t: 'file.spec.js' });
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
    });
    it('should be able to run the tests on an isolated environment using bit ci-update command', () => {
      helper.scopeHelper.addRemoteScope(helper.scopes.globalRemotePath, helper.scopes.remotePath);
      const output = helper.command.runCmd(`bit ci-update ${helper.scopes.remote}/comp/comp`, helper.scopes.remotePath);
      expect(output).to.have.string('tests passed');
    });
  });
  describe('component with compiler, tester and nested dependencies', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.env.importCompiler();
      helper.env.importTester();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isTypeES6);
      helper.fixtures.addComponentUtilsIsType();
      helper.fs.createFile('utils', 'is-string.js', fixtures.isStringES6);
      helper.fixtures.addComponentUtilsIsString();
      helper.fixtures.createComponentBarFoo(fixtures.barFooES6);
      helper.fixtures.addComponentBarFoo();

      helper.fs.createFile('bar', 'foo.spec.js', fixtures.barFooSpecES6(true));
      helper.npm.installNpmPackage('chai', '4.1.2');
      helper.command.addComponent('bar/foo.js', { i: 'bar/foo', t: 'bar/foo.spec.js' });
      helper.command.build(); // needed for building the dependencies
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
    });
    it('should be able to run the tests on an isolated environment using bit ci-update command', () => {
      helper.scopeHelper.addRemoteScope(helper.scopes.globalRemotePath, helper.scopes.remotePath);
      const output = helper.command.runCmd(`bit ci-update ${helper.scopes.remote}/bar/foo`, helper.scopes.remotePath);
      expect(output).to.have.string('tests passed');
    });
  });
});
