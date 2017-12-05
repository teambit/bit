// covers also ci-update command

import path from 'path';
import { expect } from 'chai';
import Helper from '../e2e-helper';

const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
const isTypeSpecFixture = testShouldPass => `const expect = require('chai').expect;
const isType = require('./is-type.js');

describe('isType', () => {
  it('should display "got is-type"', () => {
    expect(isType())${testShouldPass ? '' : '.not'}.to.equal('got is-type');
  });
});`;

const isTypeBeforeFailSpecFixture = `const expect = require('chai').expect;
const isType = require('./is-type.js');

describe('isType before hook describe', () => {
  describe('isType before hook internal describe', () => {
    before('failing before"', () => {
      const a = undefinedObj.something;
    });
    it('not running test"', () => {
      expect(isType()).to.equal('got is-type');
    });
  });
  it('should pass test"', () => {
    expect(true).to.equal(true);
  });
});`;

describe('bit test command', function () {
  this.timeout(0);
  const helper = new Helper();
  let clonedScopePath;
  before(() => {
    helper.reInitLocalScope();
    helper.importTester('bit.envs/testers/mocha');
    clonedScopePath = helper.cloneLocalScope();
  });
  after(() => {
    helper.destroyEnv();
  });
  describe('when there are no tests', () => {
    before(() => {
      helper.getClonedLocalScope(clonedScopePath);
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
    });
    it('should indicate that there are no tests', () => {
      const output = helper.testComponent('utils/is-type');
      expect(output).to.have.string('tests are not defined for component: utils/is-type');
    });
  });

  describe('when tests are passed', () => {
    before(() => {
      helper.getClonedLocalScope(clonedScopePath);
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.createComponent('utils', 'is-type.spec.js', isTypeSpecFixture(true));
      helper.addComponent('utils/is-type.js -t utils/is-type.spec.js');
    });
    it('should indicate that testes are passed', () => {
      const output = helper.testComponent('utils/is-type');
      expect(output).to.have.string('tests passed');
    });
  });
  describe('when tests are failed', () => {
    before(() => {
      helper.getClonedLocalScope(clonedScopePath);
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.createComponent('utils', 'is-type.spec.js', isTypeSpecFixture(false));
      helper.addComponent('utils/is-type.js -t utils/is-type.spec.js');
    });
    it('should indicate that testes are failed', () => {
      const output = helper.testComponent('utils/is-type');
      expect(output).to.have.string('tests failed');
    });
  });
  describe('when there is before hook which fail', () => {
    let output;
    let outputLines;
    before(() => {
      helper.getClonedLocalScope(clonedScopePath);
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.createComponent('utils', 'is-type.spec.js', isTypeSpecFixture(true));
      helper.createComponent('utils', 'is-type-before-fail.spec.js', isTypeBeforeFailSpecFixture);
      helper.addComponentWithOptions('utils/is-type.js', {
        t: 'utils/is-type.spec.js,utils/is-type-before-fail.spec.js'
      });
      output = helper.testComponent('utils/is-type');
      outputLines = output.split('\n');
    });
    it('should print the error for the before hook failure', () => {
      expect(output).to.have.string('undefinedObj is not defined');
    });
    it('should indicate that testes from the same spec and not in the same describe are passed', () => {
      expect(output).to.have.string('✔   isType before hook describe should pass test');
    });
    it('should indicate that testes are failed if all other tests (except the before) are passed', () => {
      // This implemented this way because when we got the files from the bit test we got it with /private as prefix
      // but on windows we will got it with other prefix.
      // So this is a hack to make sure it will run correctly on windows.
      // (you can see on comments below the version for linux only)
      const testFailedLineIndex = outputLines.indexOf('tests failed');
      const testFailedFilePathLine = outputLines[testFailedLineIndex + 1];
      const failedFilePath = path.join(helper.localScopePath, 'utils', 'is-type-before-fail.spec.js');
      // const failedFilePath = path.join('/private', helper.localScopePath, 'utils', 'is-type-before-fail.spec.js');
      // expect(output).to.have.string(`tests failed\nfile: ${failedFilePath}`);
      expect(testFailedFilePathLine).to.have.string(failedFilePath);
    });
    it('should indicate that testes in other specs files are passed', () => {
      // This implemented this way because when we got the files from the bit test we got it with /private as prefix
      // but on windows we will got it with other prefix.
      // So this is a hack to make sure it will run correctly on windows.
      // (you can see on comments below the version for linux only)
      const testPassedLineIndex = outputLines.indexOf('tests passed');
      const testPassedFilePathLine = outputLines[testPassedLineIndex + 1];
      const passedFilePath = path.join(helper.localScopePath, 'utils', 'is-type.spec.js');

      // const passFilePath = path.join('/private', helper.localScopePath, 'utils', 'is-type.spec.js');
      // expect(output).to.have.string(`tests passed\nfile: ${passFilePath}`);
      expect(testPassedFilePathLine).to.have.string(passedFilePath);
      expect(output).to.have.string('✔   isType should display "got is-type"');
    });
  });
  describe('after importing a component with tests', () => {
    before(() => {
      helper.getClonedLocalScope(clonedScopePath);
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.createComponent('utils', 'is-type.spec.js', isTypeSpecFixture(true));
      helper.addComponent('utils/is-type.js -t utils/is-type.spec.js');
      helper.commitComponent('utils/is-type');

      helper.reInitRemoteScope();
      helper.addRemoteScope();
      helper.exportComponent('utils/is-type');

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-type');
    });
    it('should import the tester and run the tests successfully', () => {
      const output = helper.testComponent('utils/is-type');
      expect(output).to.have.string('tests passed');
    });
    it('should be able to run the tests on an isolated environment using bit ci-update command', () => {
      const output = helper.runCmd(`bit ci-update ${helper.remoteScope}/utils/is-type`, helper.remoteScopePath);
      expect(output).to.have.string('tests passed');
    });
  });
});
describe('bit component with no tester', function () {
  this.timeout(0);
  const helper = new Helper();
  before(() => {
    helper.reInitLocalScope();
    helper.createComponent('bar', 'foo.js');
    helper.addComponent(path.join('bar', 'foo.js'));
  });
  after(() => {
    helper.destroyEnv();
  });
  it('should return not tester message when running test on all components', () => {
    const output = helper.testComponent();
    expect(output).to.have.string('tester for component: bar/foo is not defined');
  });
  it('should return not tester message when running test on single component', () => {
    const output = helper.testComponent('bar/foo');
    expect(output).to.have.string('tester for component: bar/foo is not defined');
  });
});
