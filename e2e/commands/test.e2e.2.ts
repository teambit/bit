// covers also ci-update command

import { expect } from 'chai';

import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';

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
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  let clonedScopePath;
  before(() => {
    helper.scopeHelper.reInitLocalScope();
    // do not upgrade to v0.0.12 of mocha tester, there is a problem with this version.
    helper.env.importTester(`${helper.scopes.globalRemote}/testers/mocha@0.0.4`);
    clonedScopePath = helper.scopeHelper.cloneLocalScope();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('when there are no tests', () => {
    before(() => {
      helper.scopeHelper.getClonedLocalScope(clonedScopePath);
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fixtures.addComponentUtilsIsType();
    });
    it('should indicate that there are no tests', () => {
      const output = helper.command.testComponent('utils/is-type');
      expect(output).to.have.string('tests are not defined for component: utils/is-type');
    });
  });
  describe('when tests are passed', () => {
    before(() => {
      helper.scopeHelper.getClonedLocalScope(clonedScopePath);
      helper.npm.installNpmPackage('chai', '4.1.2');
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fs.createFile('utils', 'is-type.spec.js', fixtures.isTypeSpec(true));
      helper.command.addComponent('utils/is-type.js -t utils/is-type.spec.js', { i: 'utils/is-type' });
    });
    it('should indicate that testes are passed', () => {
      const output = helper.command.testComponent('utils/is-type');
      expect(output).to.have.string('tests passed');
    });
  });
  describe('when tests are failed', () => {
    let statusCode;
    before(() => {
      helper.scopeHelper.getClonedLocalScope(clonedScopePath);
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fs.createFile('utils', 'is-type.spec.js', fixtures.isTypeSpec(false));
      helper.command.addComponent('utils/is-type.js -t utils/is-type.spec.js', { i: 'utils/is-type' });
    });
    it('should indicate that tests are failed', () => {
      let output;
      try {
        helper.command.testComponent('utils/is-type');
      } catch (err) {
        output = err.stdout.toString();
        statusCode = err.status;
      }
      expect(output).to.have.string('tests failed');
      expect(output).to.have.string('file: utils/is-type.spec.js');
    });
    it('should exit with non zero status code', () => {
      expect(statusCode).to.not.equal(0);
    });
    it('should indicate that this component does not exist when testing a non exist component', () => {
      let output;
      try {
        helper.command.testComponent('bar/foo');
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
      helper.scopeHelper.getClonedLocalScope(clonedScopePath);
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fs.createFile('utils', 'is-type.spec.js', "throw new Error('exception occurred with this spec file');");
      helper.command.addComponent('utils/is-type.js', { i: 'utils/is-type', t: 'utils/is-type.spec.js' });
    });
    it('should print the exception message when running bit test --verbose', () => {
      let output;
      let statusCode;
      try {
        helper.command.testComponent('utils/is-type --verbose');
      } catch (err) {
        output = err.stdout.toString();
        statusCode = err.status;
      }
      expect(output).to.have.string('exception occurred with this spec file');
      expect(statusCode).to.not.equal(0);
    });
    it('should print the exception message also when running bit test without --verbose flag', () => {
      let output;
      let statusCode;
      try {
        helper.command.testComponent('utils/is-type');
      } catch (err) {
        output = err.stdout.toString();
        statusCode = err.status;
      }
      expect(statusCode).to.not.equal(0);
      expect(output).to.have.string('exception occurred with this spec file');
    });
    describe('tagging the component without --force flag and without --verbose flag', () => {
      let output;
      before(() => {
        try {
          helper.command.tagAllComponents();
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
          helper.command.tagAllComponents('--verbose');
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
        output = helper.command.tagAllComponents('--force');
      });
      it('should tag the component successfully', () => {
        expect(output).to.have.string('1 component(s) tagged');
      });
    });
  });
  describe('when there is before hook which fail', () => {
    let output;
    let statusCode;
    let outputLines;
    before(() => {
      helper.scopeHelper.getClonedLocalScope(clonedScopePath);
      helper.npm.installNpmPackage('chai', '4.1.2');
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fs.createFile('utils', 'is-type.spec.js', fixtures.isTypeSpec(true));
      helper.fs.createFile('utils', 'is-type-before-fail.spec.js', isTypeBeforeFailSpecFixture);
      helper.command.addComponent('utils/is-type.js', {
        i: 'utils/is-type',
        t: 'utils/is-type.spec.js,utils/is-type-before-fail.spec.js',
      });
      try {
        helper.command.testComponent('utils/is-type');
      } catch (err) {
        output = err.stdout.toString();
        statusCode = err.status;
      }
      outputLines = output.split('\n');
    });
    it('should exit with non zero status code', () => {
      expect(statusCode).to.not.equal(0);
    });
    it('should print the error for the before hook failure', () => {
      expect(output).to.have.string('undefinedObj is not defined');
    });
    it('should print the stack trace when run with verbose', () => {
      let outputVerbose;
      try {
        helper.command.testComponentWithOptions('utils/is-type', { v: '' });
      } catch (err) {
        outputVerbose = err.stdout.toString();
      }
      expect(outputVerbose).to.have.string('utils/is-type-before-fail.spec.js');
    });
    it('should indicate that testes from the same spec and not in the same describe are passed', () => {
      expect(output).to.have.string('✔ isType before hook describe should pass test');
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
      expect(output).to.have.string('✔ isType should display "got is-type"');
    });
  });
  describe('after importing a component with tests', () => {
    let localScope;
    before(() => {
      helper.scopeHelper.getClonedLocalScope(clonedScopePath);
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fs.createFile('utils', 'is-type.spec.js', fixtures.isTypeSpec(true));
      helper.command.addComponent('utils/is-type.js -t utils/is-type.spec.js', { i: 'utils/is-type' });
      helper.npm.installNpmPackage('chai', '4.1.2');
      helper.command.tagComponent('utils/is-type');

      helper.scopeHelper.reInitRemoteScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.exportComponent('utils/is-type');

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.scopeHelper.addGlobalRemoteScope();
      helper.command.importComponent('utils/is-type');
      localScope = helper.scopeHelper.cloneLocalScope();
    });
    describe('when running bit-test without --verbose flag', () => {
      let output;
      before(() => {
        output = helper.command.testComponent('utils/is-type');
      });
      it('should import the tester and run the tests successfully', () => {
        expect(output).to.have.string('tests passed');
      });
      it('should show success message of installing the environment', () => {
        expect(output).to.have.string('successfully installed the global-remote/testers/mocha');
      });
      it('should not show any npm output', () => {
        expect(output).to.not.have.string('npm');
      });
    });
    describe('when running bit-test with --verbose flag', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        output = helper.command.testComponentWithOptions('utils/is-type', { '-verbose': '' });
      });
      it('should import the tester and run the tests successfully', () => {
        expect(output).to.have.string('tests passed');
      });
      it('should show success message of installing the environment', () => {
        expect(output).to.have.string('successfully installed the global-remote/testers/mocha');
      });
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
        helper.scopeHelper.addRemoteScope(helper.scopes.globalRemotePath, helper.scopes.remotePath);
        output = helper.command.runCmd(`bit ci-update ${helper.scopes.remote}/utils/is-type`, helper.scopes.remotePath);
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
      helper.scopeHelper.getClonedLocalScope(clonedScopePath);
      helper.npm.installNpmPackage('chai', '4.1.2');
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fs.createFile('utils', 'is-type.spec.js', testWithEs6);
      helper.command.addComponent('utils/is-type.js -t utils/is-type.spec.js', { i: 'utils/is-type' });
    });
    it('Should not be able to test without building first', () => {
      let output;
      let statusCode;
      try {
        helper.command.testComponent('utils/is-type -v');
      } catch (err) {
        output = err.stdout.toString();
        statusCode = err.status;
      }
      expect(statusCode).to.not.equal(0);
      expect(output).to.have.string('import {expect} from');
    });
    it('Should be able to test after building', () => {
      helper.env.importCompiler();
      helper.command.build();
      const output = helper.command.testComponent('utils/is-type');
      expect(output).to.have.string('tests passed');
    });
    // @todo: make it work once test extension is ready
    it.skip('should be able to test using the test extension', () => {
      helper.fs.deletePath('dist');
      helper.env.importCompiler();
      const output = helper.command.runCmd('bit run-test utils/is-type');
      expect(output).to.have.string('tests passed');
    });
  });
  describe('bit component with no tester', function () {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fs.createFile('bar', 'foo.js');
      helper.fixtures.addComponentBarFoo();
    });
    it('should return not tester message when running test on all components', () => {
      const output = helper.command.testComponent();
      expect(output).to.have.string('tester for component: bar/foo is not defined');
    });
    it('should return not tester message when running test on single component', () => {
      const output = helper.command.testComponent('bar/foo');
      expect(output).to.have.string('tester for component: bar/foo is not defined');
    });
  });
  describe('when there is no new or modified component', function () {
    before(() => {
      // Set imported component
      helper.scopeHelper.getClonedLocalScope(clonedScopePath);
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fs.createFile('utils', 'is-type.spec.js', fixtures.isTypeSpec(true));
      helper.command.addComponent('utils/is-type.js', { t: 'utils/is-type.spec.js', i: 'utils/is-type' });
      helper.npm.installNpmPackage('chai', '4.1.2');
      helper.command.tagComponent('utils/is-type');

      helper.scopeHelper.reInitRemoteScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.exportComponent('utils/is-type');

      helper.scopeHelper.getClonedLocalScope(clonedScopePath);
      helper.npm.installNpmPackage('chai', '4.1.2');
      helper.scopeHelper.addRemoteScope();

      helper.command.importComponent('utils/is-type');

      // Set authored component
      helper.fixtures.createComponentBarFoo();
      helper.fs.createFile('bar', 'foo.spec.js', fixtures.passTest);
      helper.command.addComponent('bar/foo.js', { t: 'bar/foo.spec.js', i: 'bar/foo' });
      helper.fixtures.tagComponentBarFoo();
    });
    it('should show there is nothing to test', () => {
      const output = helper.command.testComponent();
      expect(output).to.have.string('nothing to test');
    });
    describe('using --all flag', () => {
      let output;
      before(() => {
        output = helper.command.testComponentWithOptions('', { '-all': '' });
      });
      it('should test authored component when using --all', () => {
        expect(output).to.have.string('bar/foo@0.0.1\ntests passed');
      });
      it('should test imported component when using --all', () => {
        expect(output).to.have.string('utils/is-type@0.0.1\ntests passed');
      });
    });
  });
});
