import { expect } from 'chai';
import Helper from '../e2e-helper';

const fileSpecFixture = testShouldPass => `const expect = require('chai').expect;
const comp = require('./file');

describe('comp', () => {
  it('should display "comp level0 level1"', () => {
    expect(comp())${testShouldPass ? '' : '.not'}.to.equal('comp level0 level1');
  });
});`;

const barFooSpecFixture = testShouldPass => `const expect = require('chai').expect;
const foo = require('./foo.js');

describe('foo', () => {
  it('should display "got is-type and got is-string and got foo"', () => {
    expect(foo())${testShouldPass ? '' : '.not'}.to.equal('got is-type and got is-string and got foo');
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
      helper.importTester('bit.envs/testers/mocha');
      const level1Fixture = "module.exports = function level1() { return 'level1'; };";
      helper.createFile('', 'level1.js', level1Fixture);
      const level0Fixture =
        "var level1 = require('./level1'); module.exports = function level0() { return 'level0 ' + level1(); };";
      helper.createFile('', 'level0.js', level0Fixture);
      helper.addComponentWithOptions('level0.js', { i: 'dep/level0' });
      helper.addComponentWithOptions('level1.js', { i: 'dep/level1' });
      const fileFixture =
        "var level0 = require('./level0'); module.exports = function comp() { return 'comp ' + level0()};";
      helper.createFile('', 'file.js', fileFixture);
      helper.createFile('', 'file.spec.js', fileSpecFixture(true));
      helper.addComponentWithOptions('file.js', { i: 'comp/comp', t: 'file.spec.js' });
      helper.commitAllComponents();
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
      helper.importCompiler('bit.envs/compilers/babel');
      helper.importTester('bit.envs/testers/mocha');
      const isTypeFixture = "export default function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      const isStringFixture =
        "import isType from './is-type.js'; export default function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      const fooBarFixture =
        "import isString from '../utils/is-string.js'; export default function foo() { return isString() + ' and got foo'; };";
      helper.createComponentBarFoo(fooBarFixture);
      helper.addComponentBarFoo();

      helper.createFile('bar', 'foo.spec.js', barFooSpecFixture(true));
      helper.addComponentWithOptions('bar/foo.js', { i: 'bar/foo', t: 'bar/foo.spec.js' });
      helper.build(); // needed for building the dependencies
      helper.commitAllComponents();
      helper.exportAllComponents();
    });
    it('should be able to run the tests on an isolated environment using bit ci-update command', () => {
      const output = helper.runCmd(`bit ci-update ${helper.remoteScope}/bar/foo`, helper.remoteScopePath);
      expect(output).to.have.string('tests passed');
    });
  });
});
