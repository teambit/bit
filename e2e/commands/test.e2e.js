// covers also ci-update command

import path from 'path';
import { expect } from 'chai';
import Helper from '../e2e-helper';
import * as fixtures from '../fixtures/fixtures';

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
    // do not upgrade to v0.0.12 of mocha tester, there is a problem with this version.
    helper.importTester('bit.envs/testers/mocha@0.0.4');
    clonedScopePath = helper.cloneLocalScope();
  });
  after(() => {
    helper.destroyEnv();
  });
  describe('when there are no tests', () => {
    before(() => {
      helper.getClonedLocalScope(clonedScopePath);
      helper.createFile('utils', 'is-type.js', fixtures.isType);
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
      helper.installNpmPackage('chai', '4.1.2');
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.createFile('utils', 'is-type.spec.js', fixtures.isTypeSpec(true));
      helper.addComponent('utils/is-type.js -t utils/is-type.spec.js');
    });
    it('should indicate that testes are passed', () => {
      const output = helper.testComponent('utils/is-type');
      expect(output).to.have.string('tests passed');
    });
    it('Should not be able to run tests with wrong tester env', () => {
      helper.importTester('bit.envs/testers/jest@0.0.18');
      const output = helper.testComponent('utils/is-type');
      expect(output).to.have.string('❌   Jest failure');
    });
  });
  describe('when tests are failed', () => {
    before(() => {
      helper.getClonedLocalScope(clonedScopePath);
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.createFile('utils', 'is-type.spec.js', fixtures.isTypeSpec(false));
      helper.addComponent('utils/is-type.js -t utils/is-type.spec.js');
    });
    it('should indicate that tests are failed', () => {
      const output = helper.testComponent('utils/is-type');
      expect(output).to.have.string('tests failed');
      expect(output).to.have.string('file: utils/is-type.spec.js');
    });
    it('should indicate that this component does not exist when testing a non exist component', () => {
      let output;
      try {
        helper.testComponent('bar/foo');
      } catch (err) {
        output = err.message;
      }
      expect(output).to.have.string(
        "error: component \"bar/foo\" was not found on your local workspace.\nplease specify a valid component ID or track the component using 'bit add' (see 'bit add --help' for more information)\n"
      );
    });
  });
  describe('when an exception was thrown during the tests', () => {
    before(() => {
      helper.getClonedLocalScope(clonedScopePath);
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.createFile('utils', 'is-type.spec.js', "throw new Error('exception occurred with this spec file');");
      helper.addComponent('utils/is-type.js -t utils/is-type.spec.js');
    });
    it('should print the exception message when running bit test --verbose', () => {
      const output = helper.testComponent('utils/is-type --verbose');
      expect(output).to.have.string('exception occurred with this spec file');
    });
    it('should print the exception message also when running bit test without --verbose flag', () => {
      const output = helper.testComponent('utils/is-type');
      expect(output).to.have.string('exception occurred with this spec file');
    });
    describe('tagging the component without --force flag and without --verbose flag', () => {
      let output;
      before(() => {
        try {
          helper.tagAllWithoutMessage();
        } catch (err) {
          output = err.message;
        }
      });
      it('should show a general message saying the specs does not pass', () => {
        expect(output).to.have.string(
          'component tests failed. please make sure all tests pass before tagging a new version or use the "--force" flag to force-tag components.\nto view test failures, please use the "--verbose" flag or use the "bit test" command\n'
        );
      });
    });
    describe('tagging the component without --force flag and with --verbose flag', () => {
      let output;
      before(() => {
        try {
          helper.tagAllWithoutMessage('--verbose');
        } catch (err) {
          output = err.message;
        }
      });
      it('should show the exact exception it caught', () => {
        expect(output).to.have.string('exception occurred with this spec file');
      });
    });
    describe('tagging the component with --force flag', () => {
      let output;
      before(() => {
        output = helper.tagAllWithoutMessage('--force');
      });
      it('should tag the component successfully', () => {
        expect(output).to.have.string('1 components tagged');
      });
    });
  });
  describe('when there is before hook which fail', () => {
    let output;
    let outputLines;
    before(() => {
      helper.getClonedLocalScope(clonedScopePath);
      helper.installNpmPackage('chai', '4.1.2');
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.createFile('utils', 'is-type.spec.js', fixtures.isTypeSpec(true));
      helper.createFile('utils', 'is-type-before-fail.spec.js', isTypeBeforeFailSpecFixture);
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
      const testFailedLineIndex = outputLines.indexOf('tests failed');
      const testFailedFilePathLine = outputLines[testFailedLineIndex + 1];
      expect(testFailedFilePathLine).to.have.string('utils/is-type-before-fail.spec.js');
    });
    it('should indicate that testes in other specs files are passed', () => {
      const testPassedLineIndex = outputLines.indexOf('tests passed');
      const testPassedFilePathLine = outputLines[testPassedLineIndex + 1];
      expect(testPassedFilePathLine).to.have.string('utils/is-type.spec.js');
      expect(output).to.have.string('✔   isType should display "got is-type"');
    });
  });
  describe('after importing a component with tests', () => {
    let localScope;
    before(() => {
      helper.getClonedLocalScope(clonedScopePath);
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.createFile('utils', 'is-type.spec.js', fixtures.isTypeSpec(true));
      helper.addComponent('utils/is-type.js -t utils/is-type.spec.js');
      helper.installNpmPackage('chai', '4.1.2');
      helper.commitComponent('utils/is-type');

      helper.reInitRemoteScope();
      helper.addRemoteScope();
      helper.exportComponent('utils/is-type');

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-type');
      localScope = helper.cloneLocalScope();
    });
    describe('when running bit-test without --verbose flag', () => {
      let output;
      before(() => {
        output = helper.testComponent('utils/is-type');
      });
      it('should import the tester and run the tests successfully', () => {
        expect(output).to.have.string('tests passed');
      });
      it('should show success message of installing the environment', () => {
        expect(output).to.have.string('successfully installed the bit.envs/testers/mocha');
      });
      it('should not show any npm output', () => {
        expect(output).to.not.have.string('npm');
      });
    });
    describe('when running bit-test with --verbose flag', () => {
      let output;
      before(() => {
        helper.getClonedLocalScope(localScope);
        output = helper.testComponentWithOptions('utils/is-type', { '-verbose': '', '-fork-level': 'NONE' });
      });
      it('should import the tester and run the tests successfully', () => {
        expect(output).to.have.string('tests passed');
      });
      it('should show success message of installing the environment', () => {
        expect(output).to.have.string('successfully installed the bit.envs/testers/mocha');
      });
      // TODO: Gilad - fix this (it fails because of this output printed throw the child process of a fork process)
      // TODO: It doe's work as expected when using --fork-level NONE
      it('should show success message of installing npm-packages', () => {
        expect(output).to.have.string('successfully ran npm install at');
      });
      it('should show npm output', () => {
        expect(output).to.have.string('npm WARN');
      });
    });
    describe('when running bit ci-update', () => {
      let output;
      before(() => {
        output = helper.runCmd(`bit ci-update ${helper.remoteScope}/utils/is-type`, helper.remoteScopePath);
      });
      it('should be able to run the tests on an isolated environment', () => {
        expect(output).to.have.string('tests passed');
      });
      it('should show success message of installing npm-packages', () => {
        expect(output).to.have.string('successfully ran npm install at');
      });
      it('should show npm warnings', () => {
        expect(output).to.have.string('npm WARN');
      });
    });
    describe('import with --conf', () => {
      before(() => {
        helper.getClonedLocalScope(localScope);
        helper.importComponent('utils/is-type --conf');
      });
      it('should save the tester with id only without files and config because it does not use them', () => {
        const bitJson = helper.readBitJson(path.join(helper.localScopePath, 'components/utils/is-type/bit.json'));
        expect(bitJson).to.have.property('env');
        expect(bitJson.env).to.have.property('tester');
        expect(bitJson.env.tester).to.have.string('testers/mocha');
      });
    });
  });
  describe('bit component with es6 syntax without building before testing', () => {
    const testWithEs6 = `import {expect} from 'chai';
    import isType from './is-type.js';

    describe('isType', () => {
      it('should display "got is-type"', () => {
        expect(isType()).to.equal('got is-type');
      });
    });`;

    before(() => {
      helper.getClonedLocalScope(clonedScopePath);
      helper.installNpmPackage('chai', '4.1.2');
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.createFile('utils', 'is-type.spec.js', testWithEs6);
      helper.addComponent('utils/is-type.js -t utils/is-type.spec.js');
    });
    it('Should not be able to test without building first', () => {
      const output = helper.testComponent('utils/is-type -v');
      expect(output).to.have.string('Unexpected token import');
    });
    it('Should be able to test after building', () => {
      helper.importCompiler();
      helper.build();
      const output = helper.testComponent('utils/is-type');
      expect(output).to.have.string('tests passed');
    });
  });
});
describe('bit component with no tester', function () {
  this.timeout(0);
  const helper = new Helper();
  before(() => {
    helper.reInitLocalScope();
    helper.createFile('bar', 'foo.js');
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
