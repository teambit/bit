import chai, { expect } from 'chai';
import { IS_WINDOWS } from '@teambit/legacy.constants';
import { Helper } from '@teambit/legacy.e2e-helper';
import { specFilePassingFixture, specFileFailingFixture, specFileErroringFixture } from './jest-fixtures';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

describe('Jest Tester', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('component without any test file', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(1);
    });
    it('bit test should not throw any error', () => {
      expect(() => helper.command.test()).not.to.throw();
    });
    it('bit test should indicate that no tests found', () => {
      const output = helper.command.test();
      expect(output).to.have.string('no tests found');
    });
    it('bit build should not fail', () => {
      expect(() => helper.command.build()).not.to.throw();
    });
  });
  // This is failing on Windows with a message from Jest about tests-not-found.
  // the reason for this error is that Node provides paths in the windows-short format of 8.3 and Jest needs the full-path.
  // e.g. #1 is the path passed to Jest, which Jest doesn't recognize well. #2 is the path that Jest recognizes and could work.
  // #1. C:\\Users\\ADMINI~1\\AppData\\Local\\Temp\\2\\bit\\e2e\\2zmx1543-local\\comp1\\comp1.spec.ts
  // #2. C:\\Users\\Administrator\\AppData\\Local\\Temp\\2\\bit\\e2e\\2zmx1543-local\\comp1\\comp1.spec.ts
  (IS_WINDOWS ? describe.skip : describe)('component with a passing test', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile('comp1/comp1.spec.ts', specFilePassingFixture());
    });
    it('bit test should show the passing component via Jest output', () => {
      const output = helper.command.test('', true);
      expect(output).to.have.string('✓ should pass');
    });
    it('bit build should show the passing component via Jest output', () => {
      const output = helper.command.build('', undefined, true);
      expect(output).to.have.string('✓ should pass');
    });
  });
  (IS_WINDOWS ? describe.skip : describe)('component with a failing test', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile('comp1/comp1.spec.ts', specFileFailingFixture());
    });
    it('bit test should exit with non-zero code', () => {
      expect(() => helper.command.test()).to.throw();
    });
    it('bit test should show the failing component via Jest output', () => {
      const output = helper.general.runWithTryCatch('bit test');
      expect(output).to.have.string('✕ should fail');
    });
    it('bit build should show the failing component via Jest output', () => {
      const output = helper.general.runWithTryCatch('bit build');
      expect(output).to.have.string('✕ should fail');
    });
    it('bit build should not show the failing component if --skip-tests was entered', () => {
      const output = helper.command.build(undefined, '--skip-tests');
      expect(output).to.not.have.string('should fail');
      expect(output).to.have.string('build succeeded');
    });
  });
  describe('component with an errored test', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile('comp1/comp1.spec.ts', specFileErroringFixture());
    });
    it('bit test should exit with non-zero code', () => {
      expect(() => helper.command.test()).to.throw();
    });
    it('bit test should show the error', () => {
      const output = helper.general.runWithTryCatch('bit test');
      expect(output).to.have.string('SomeError');
      expect(output).to.have.string('1 failed');
    });
    it('bit build should show the error', () => {
      const output = helper.general.runWithTryCatch('bit build');
      expect(output).to.have.string('SomeError');
    });
  });
  describe('env with an incorrect Jest config', () => {
    let envName;
    let envId;
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile('comp1/comp1.spec.ts', specFilePassingFixture());
      envName = helper.env.setCustomNewEnv('invalid-jest-config-env', [
        '@teambit/react.react-env',
        '@teambit/typescript.typescript-compiler',
        '@teambit/defender.jest-tester',
        '@teambit/defender.testers.multi-tester',
      ]);
      envId = `${helper.scopes.remote}/${envName}`;
      helper.command.setEnv('comp1', envId);
    });
    it('bit test should exit with non-zero code', () => {
      expect(() => helper.command.test()).to.throw();
    });
    it('bit test should show the error', () => {
      const output = helper.general.runWithTryCatch('bit test');
      expect(output).to.have.string('someUndefinedFunc is not defined');
    });
    it('bit build should show the error', () => {
      const output = helper.general.runWithTryCatch('bit build');
      expect(output).to.have.string('someUndefinedFunc is not defined');
    });
  });

  describe('env with custom spec resolver', () => {
    let compName;
    let envName;
    let envId;
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      compName = helper.fixtures.populateComponents(1);
      helper.fs.outputFile('comp1/comp1.spec.ts', specFilePassingFixture());
      helper.fs.outputFile(
        'comp1/comp1.custom-pattern.spec.ts',
        specFilePassingFixture('custom pattern describe text', 'custom pattern it text')
      );
      envName = helper.env.setCustomNewEnv('custom-jest-resolve-env', [
        '@teambit/react.react-env',
        '@teambit/typescript.typescript-compiler',
        '@teambit/defender.jest-tester',
      ]);
      envId = `${helper.scopes.remote}/${envName}`;
      helper.command.setEnv('comp1', envId);
    });
    describe('bit test command', () => {
      let output;
      before(() => {
        output = helper.command.test('', true);
      });
      it('bit test should mentions the custom resolved spec file', () => {
        expect(output).to.have.string('comp1.custom-pattern.spec');
      });
      (IS_WINDOWS ? it.skip : it)(
        'bit test should show the passing component for resolved specs via Jest output',
        () => {
          expect(output).to.have.string('✓ custom pattern it text');
        }
      );
      it('bit test should not mentions the default spec file', () => {
        expect(output).to.not.have.string('comp1.spec');
      });
      it('bit test should NOT show the passing component for default specs via Jest output', () => {
        expect(output).to.not.have.string('should pass');
      });
    });
    describe('bit build command', () => {
      let output;
      before(() => {
        output = helper.command.build(compName, undefined, true);
      });
      it('bit build should mentions the custom resolved spec file', () => {
        expect(output).to.have.string('comp1.custom-pattern.spec');
      });
      (IS_WINDOWS ? it.skip : it)(
        'bit build should show the passing component for resolved specs via Jest output',
        () => {
          expect(output).to.have.string('✓ custom pattern it text');
        }
      );
      it('bit build should not mentions the default spec file', () => {
        expect(output).to.not.have.string('comp1.spec');
      });
      it('bit build should NOT show the passing component for default specs via Jest output', () => {
        expect(output).to.not.have.string('should pass');
      });
    });
  });
});
