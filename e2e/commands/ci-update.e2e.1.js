import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../fixtures/fixtures';

const fileSpecFixture = testShouldPass => `const expect = require('chai').expect;
const comp = require('./file');

describe('comp', () => {
  it('should display "comp level0 level1"', () => {
    expect(comp())${testShouldPass ? '' : '.not'}.to.equal('comp level0 level1');
  });
});`;

describe('bit ci-update', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });

  describe('component with tester and nested dependencies', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.importTester('bit.envs/testers/mocha@0.0.12');
      const level1Fixture = "module.exports = function level1() { return 'level1'; };";
      helper.createFile('', 'level1.js', level1Fixture);
      const level0Fixture =
        "var level1 = require('./level1'); module.exports = function level0() { return 'level0 ' + level1(); };";
      helper.createFile('', 'level0.js', level0Fixture);
      helper.addComponent('level0.js', { i: 'dep/level0' });
      helper.addComponent('level1.js', { i: 'dep/level1' });
      const fileFixture =
        "var level0 = require('./level0'); module.exports = function comp() { return 'comp ' + level0()};";
      helper.createFile('', 'file.js', fileFixture);
      helper.createFile('', 'file.spec.js', fileSpecFixture(true));
      helper.installNpmPackage('chai', '4.1.2');
      helper.addComponent('file.js', { i: 'comp/comp', t: 'file.spec.js' });
      helper.tagAllComponents();
      helper.exportAllComponents();
    });
    it('should be able to run the tests on an isolated environment using bit ci-update command', () => {
      const output = helper.runCmd(`bit ci-update ${helper.remoteScope}/comp/comp`, helper.remoteScopePath);
      expect(output).to.have.string('tests passed');
    });
  });
  describe('component with compiler, tester and nested dependencies', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.importCompiler('bit.envs/compilers/babel@0.0.20');
      helper.importTester('bit.envs/testers/mocha@0.0.12');
      helper.createFile('utils', 'is-type.js', fixtures.isTypeES6);
      helper.addComponentUtilsIsType();
      helper.createFile('utils', 'is-string.js', fixtures.isStringES6);
      helper.addComponentUtilsIsString();
      helper.createComponentBarFoo(fixtures.barFooES6);
      helper.addComponentBarFoo();

      helper.createFile('bar', 'foo.spec.js', fixtures.barFooSpecES6(true));
      helper.installNpmPackage('chai', '4.1.2');
      helper.addComponent('bar/foo.js', { i: 'bar/foo', t: 'bar/foo.spec.js' });
      helper.build(); // needed for building the dependencies
      helper.tagAllComponents();
      helper.exportAllComponents();
    });
    it('should be able to run the tests on an isolated environment using bit ci-update command', () => {
      const output = helper.runCmd(`bit ci-update ${helper.remoteScope}/bar/foo`, helper.remoteScopePath);
      expect(output).to.have.string('tests passed');
    });
  });
});
