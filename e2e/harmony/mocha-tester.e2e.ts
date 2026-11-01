import { expect } from 'chai';
import { Helper, ENV_POLICY } from '@teambit/legacy.e2e-helper';

describe('Mocha Tester', function () {
  this.timeout(0);
  let helper: Helper;
  let envId: string;
  let envName: string;

  const setupMochaEnv = () => {
    envName = helper.env.setCustomNewEnv(
      'mocha-only-test-env',
      [
        '@teambit/typescript.typescript-compiler',
        '@teambit/defender.mocha-tester',
        'chai',
        'chai-fs',
        '@babel/preset-typescript',
        '@babel/preset-env',
      ],
      // this env's spec files use the mocha globals, and TS6 only loads @types packages that the
      // tsconfig names. the default policy forces @types/jest, which is the wrong runner here.
      {
        policy: {
          ...ENV_POLICY,
          dev: [
            ...ENV_POLICY.dev.filter((dep) => dep.name !== '@types/jest'),
            { name: '@types/mocha', version: '^10.0.0', hidden: true, force: true },
            // the spec files import chai, and chai ships no declarations of its own.
            { name: '@types/chai', version: '^5.2.3', hidden: true, force: true },
          ],
        },
      }
    );
    envId = `${helper.scopes.remote}/${envName}`;
  };

  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('component that use Mocha as a tester', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      setupMochaEnv();
      helper.command.setEnv('comp1', envId);
      helper.command.install();
    });
    describe('component without any test file', () => {
      // this used to be preceded by a "should not throw any error" test that ran the very same
      // command. helper.command.test() throws on a non-zero exit code, so reaching the assertion
      // below already proves the command succeeded - no need to pay for a second tester run.
      it('bit test should not throw and should indicate that no tests found', () => {
        const output = helper.command.test();
        expect(output).to.have.string('no tests found');
      });
      it('bit build should not fail', () => {
        expect(() => helper.command.build()).not.to.throw();
      });
    });
    describe('component with a passing test', () => {
      before(() => {
        helper.fs.outputFile('comp1/comp1.spec.ts', specFilePassingFixture());
      });
      it('bit test should show the passing component via Mocha output', () => {
        const output = helper.command.test('', true);
        shouldOutputTestPassed(output);
      });
      it('bit build should show the passing component via Mocha output', () => {
        const output = helper.command.build('', undefined, true);
        shouldOutputTestPassed(output);
      });
    });
    describe('component with a failing test', () => {
      before(() => {
        helper.fs.outputFile('comp1/comp1.spec.ts', specFileFailingFixture());
      });
      it('bit test should exit with non-zero code and show the failing component via Mocha output', () => {
        const output = runExpectingNonZeroExit(helper, 'bit test');
        expect(output).to.have.string('1 failing');
      });
      it('bit build should show the failing component via Mocha output', () => {
        const output = helper.general.runWithTryCatch('bit build');
        expect(output).to.have.string('1 failing');
      });
    });
    describe('component with an errored test', () => {
      before(() => {
        helper.fs.outputFile('comp1/comp1.spec.ts', specFileErroringFixture());
      });
      it('bit test should exit with non-zero code and show the error', () => {
        const output = runExpectingNonZeroExit(helper, 'bit test');
        expect(output).to.have.string('SomeError');
      });
      it('bit build should show the error', () => {
        const output = helper.general.runWithTryCatch('bit build');
        expect(output).to.have.string('SomeError');
      });
    });
    // a "component with an errored before hook" describe used to live here, asserting that a throw
    // inside a `before` hook surfaces via `bit test` and `bit build`. the tester turns a hook failure
    // into an ordinary failed TestResult (the 'fail' handler in mocha-tester.ts calls handleTest for
    // test.type !== 'test'), so by the time the CLI and the build task see it, it is shaped exactly
    // like the "component with a failing test" case above: TestsFiles{failed:1} plus a populated
    // `errors` array. The hook-specific part - that the failure is captured at all, fix #6753 - lives
    // in @teambit/defender.mocha-tester and is covered by its own unit spec, which has an
    // identically named "component with an errored before hook" describe.
  });
});

/**
 * runs `cmd`, asserts it exited with a non-zero code, and returns its combined output.
 *
 * each failure scenario used to spend two full tester runs on one command: one `it` calling
 * helper.command.test() only to assert it throws, and a sibling re-running the same command through
 * runWithTryCatch() only to assert on its output. they could not be collapsed naively because
 * runWithTryCatch goes through spawnSync, which never throws on a non-zero exit. going through the
 * execSync path instead gives us both: landing in the catch block IS the non-zero-exit assertion,
 * and the error carries the piped stdout/stderr.
 */
function runExpectingNonZeroExit(helper: Helper, cmd: string): string {
  let output: string | undefined;
  try {
    helper.command.runCmd(cmd);
  } catch (err: any) {
    output = `${err.toString()}${err.stdout?.toString() ?? ''}${err.stderr?.toString() ?? ''}`;
  }
  expect(output, `"${cmd}" should have exited with a non-zero code`).to.be.a('string');
  return output as string;
}

function shouldOutputTestPassed(output: string) {
  expect(output).to.satisfy(
    (str: string) => str.includes('✔ should pass') /** Linux */ || str.includes('√ should pass') /** Windows */
  );
}

function specFilePassingFixture() {
  return `import { expect } from 'chai';
describe('test', () => {
  it('should pass', () => {
    expect(true).to.be.true;
  });
});
`;
}

function specFileFailingFixture() {
  return `import { expect } from 'chai';
describe('test', () => {
  it('should fail', () => {
    expect(true).to.be.false;
  });
});
`;
}

function specFileErroringFixture() {
  return `import { expect } from 'chai';
describe('test', () => {
    throw new Error('SomeError');
  it('should not reach here', () => {
    expect(true).to.be.true;
  });
});
`;
}
