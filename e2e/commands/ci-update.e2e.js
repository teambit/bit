import { expect } from 'chai';
import Helper from '../e2e-helper';

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

  describe.skip('component with nested dependencies', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.reInitRemoteScope();
      helper.importTester('bit.envs/testers/mocha');
      helper.addRemoteScope();
      const level1Fixture = "module.exports = function level1() { return 'level1'; };";
      helper.createFile('', 'level1.js', level1Fixture);
      const level0Fixture = `var level1 = require('./level1'); module.exports = function level0() { return 'level0 ' + level1(); };`;
      helper.createFile('', 'level0.js', level0Fixture);
      helper.addComponentWithOptions('level0.js', { i: 'dep/level0' });
      helper.addComponentWithOptions('level1.js', { i: 'dep/level1' });
      const fileFixture = `var level0 = require('./level0'); module.exports = function comp() { return 'comp ' + level0()};`;
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
});
