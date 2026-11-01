import { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

describe('validate command', function () {
  this.timeout(0);
  let helper: Helper;

  before(() => {
    helper = new Helper();
  });

  after(() => {
    helper.scopeHelper.destroy();
  });

  // each workspace state below (clean / type error / lint error) used to be rebuilt by two or three
  // separate describes, one per flag. they share a single before hook per state now.
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
    it('with the deprecated --continue-on-error flag, should show a deprecation warning and still run successfully', () => {
      const output = helper.command.runCmd('bit validate --continue-on-error');
      expect(output).to.include('--continue-on-error is deprecated');
      expect(output).to.include('All validation checks passed');
    });
  });

  describe('validating components with type errors', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile('comp1/comp1.ts', 'const x: number = "string";');
    });
    it('should continue to run all checks by default', () => {
      const output = helper.general.runWithTryCatch('bit validate');
      expect(output).to.include('1/3 Type Checking');
      expect(output).to.include('2/3 Linting');
      expect(output).to.include('3/3 Testing');
      expect(output).to.include('Validation failed');
    });
    it('with --fail-fast, should stop at the first failure and not run subsequent checks', () => {
      const output = helper.general.runWithTryCatch('bit validate --fail-fast');
      expect(output).to.include('1/3 Type Checking');
      expect(output).to.include('Validation failed');
      expect(output).to.not.include('2/3 Linting');
      expect(output).to.not.include('3/3 Testing');
    });
  });

  describe('validating components with lint errors', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(1);
      // Create a real linting error (undefined variable)
      helper.fs.outputFile('comp1/comp1.js', 'console.log(undefinedVariable);');
    });
    it('should continue to run all checks by default and show the lint error details', () => {
      const output = helper.general.runWithTryCatch('bit validate');
      expect(output).to.include('1/3 Type Checking');
      expect(output).to.include('2/3 Linting');
      expect(output).to.include('3/3 Testing');
      expect(output).to.include('Validation failed');
      expect(output).to.include('error');
    });
    it('with --fail-fast, should stop at linting and not run testing', () => {
      const output = helper.general.runWithTryCatch('bit validate --fail-fast');
      expect(output).to.include('1/3 Type Checking');
      expect(output).to.include('2/3 Linting');
      expect(output).to.include('Validation failed');
      expect(output).to.not.include('3/3 Testing');
    });
    describe('with --skip-tasks flag', () => {
      it('should pass when skipping the lint task', () => {
        const output = helper.command.runCmd('bit validate --skip-tasks lint');
        expect(output).to.not.include('Linting');
        expect(output).to.include('All validation checks passed');
      });
      it('should support comma-separated skip-tasks', () => {
        const output = helper.command.runCmd('bit validate --skip-tasks "lint,test"');
        expect(output).to.not.include('Linting');
        expect(output).to.not.include('Testing');
        expect(output).to.include('Type Checking');
      });
      it('should show warning when all tasks are skipped', () => {
        const output = helper.command.runCmd('bit validate --skip-tasks "check-types,lint,test"');
        expect(output).to.include('All validation tasks were skipped');
      });
      it('should error on invalid skip-tasks value', () => {
        const output = helper.general.runWithTryCatch('bit validate --skip-tasks "lnt"');
        expect(output).to.include('unknown skip-tasks: lnt');
      });
    });
  });

  describe('validating with --unmodified flag', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
    });
    it('should validate no components by default when all components are unmodified', () => {
      const output = helper.command.runCmd('bit validate');
      expect(output).to.include('No components found to validate');
    });
    it('should validate all components with --unmodified', () => {
      const output = helper.command.runCmd('bit validate --unmodified');
      expect(output).to.include('Validating 2 component(s)');
      expect(output).to.include('All validation checks passed');
    });
    it('should still support the deprecated --all flag and show a deprecation warning', () => {
      const output = helper.command.runCmd('bit validate --all');
      expect(output).to.include('--all is deprecated, use --unmodified instead');
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
