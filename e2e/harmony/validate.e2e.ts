import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';

chai.use(chaiFs);

describe('validate command', function () {
  this.timeout(0);
  let helper: Helper;

  before(() => {
    helper = new Helper();
  });

  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('validating components without errors', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(1);
    });
    it('should pass all validation checks', () => {
      const output = helper.command.runCmd('bit validate');
      expect(output).to.include('1/3 Type Checking');
      expect(output).to.include('2/3 Linting');
      expect(output).to.include('3/3 Testing');
      expect(output).to.include('All validation checks passed');
    });
  });

  describe('validating components with type errors', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile('comp1/comp1.ts', 'const x: number = "string";');
    });
    it('should fail at type checking step', () => {
      const output = helper.general.runWithTryCatch('bit validate');
      expect(output).to.include('1/3 Type Checking');
      expect(output).to.include('Validation failed');
      expect(output).to.not.include('2/3 Linting');
    });
  });

  describe('validating components with lint errors', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(1);
      // Create a real linting error (undefined variable)
      helper.fs.outputFile('comp1/comp1.js', 'console.log(undefinedVariable);');
    });
    it('should fail at linting step', () => {
      const output = helper.general.runWithTryCatch('bit validate');
      expect(output).to.include('1/3 Type Checking');
      expect(output).to.include('2/3 Linting');
      expect(output).to.include('Validation failed');
      expect(output).to.not.include('3/3 Testing');
    });
    it('should show the lint error details', () => {
      const output = helper.general.runWithTryCatch('bit validate');
      expect(output).to.include('error');
    });
  });

  describe('validating with --all flag', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(2);
    });
    it('should validate all components', () => {
      const output = helper.command.runCmd('bit validate --all');
      expect(output).to.include('Validating 2 component(s)');
      expect(output).to.include('All validation checks passed');
    });
  });

  describe('validating with component pattern', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(2);
    });
    it('should validate only matching components', () => {
      const output = helper.command.runCmd('bit validate comp1');
      expect(output).to.include('Validating 1 component(s)');
      expect(output).to.include('All validation checks passed');
    });
  });

  describe('validating with no components', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
    });
    it('should show no components message', () => {
      const output = helper.command.runCmd('bit validate');
      expect(output).to.include('No components found to validate');
    });
  });
});
