import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';

chai.use(chaiFs);

describe('Mocha Tester', function () {
  this.timeout(0);
  let helper: Helper;
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
      helper.command.setEnv('comp1', 'teambit.harmony/envs/core-aspect-env');
      helper.command.install();
    });
    describe('component without any test file', () => {
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
      it('bit test should exit with non-zero code', () => {
        expect(() => helper.command.test()).to.throw();
      });
      it('bit test should show the failing component via Mocha output', () => {
        const output = helper.general.runWithTryCatch('bit test');
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
      it('bit test should exit with non-zero code', () => {
        expect(() => helper.command.test()).to.throw();
      });
      it('bit test should show the error', () => {
        const output = helper.general.runWithTryCatch('bit test');
        expect(output).to.have.string('SomeError');
      });
      it('bit build should show the error', () => {
        const output = helper.general.runWithTryCatch('bit build');
        expect(output).to.have.string('SomeError');
      });
    });
    describe('component with an errored before hook', () => {
      before(() => {
        helper.fs.outputFile('comp1/comp1.spec.ts', specFileWithErrorInBeforeHook());
      });
      it('bit test should exit with non-zero code', () => {
        expect(() => helper.command.test()).to.throw();
      });
      it('bit test should show the error', () => {
        const output = helper.general.runWithTryCatch('bit test');
        expect(output).to.have.string('SomeError');
      });
      it('bit build should show the error', () => {
        const output = helper.general.runWithTryCatch('bit build');
        expect(output).to.have.string('SomeError');
      });
    });
  });
  describe('typescript component', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponentsTS(1);
      helper.command.setEnv('comp1', 'teambit.harmony/envs/core-aspect-env');
      helper.command.install();
      helper.fs.outputFile(
        'comp1/foo.ts',
        `export function addOne(num: number): number {
  return num + 1;
}`
      );
      helper.fs.outputFile(
        'comp1/foo.spec.ts',
        `import { addOne } from './foo';
import { expect } from 'chai';
import chaiFs from 'chai-fs';
describe('addOne', () => {
  it('should add one', () => {
    const result = addOne(1);
    expect(result).to.equal(2);
  });
});`
      );
    });
    it('should not throw an error compilation errors', () => {
      expect(() => helper.command.test()).to.not.throw();
    });
  });
  describe('component with multiple spec files and .only in one spec', () => {
    let envId;
    let envName;
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(1);

      // Create a custom env with mocha tester
      envName = helper.env.setCustomNewEnv('mocha-only-test-env', [
        '@teambit/typescript.typescript-compiler',
        '@teambit/defender.mocha-tester',
        'chai',
      ]);
      envId = `${helper.scopes.remote}/${envName}`;
      helper.command.setEnv('comp1', envId);
      helper.command.install();

      // First spec file with .only on one test
      helper.fs.outputFile(
        'comp1/first.spec.ts',
        `import { expect } from 'chai';
describe('first spec file', () => {
  it.only('should run this test', () => {
    expect(true).to.be.true;
  });
  it('should NOT run this test', () => {
    throw new Error('This test should not have run');
  });
});`
      );

      // Second spec file without .only - should NOT run at all
      helper.fs.outputFile(
        'comp1/second.spec.ts',
        `import { expect } from 'chai';
describe('second spec file', () => {
  it('should NOT run - no .only in this file', () => {
    throw new Error('This test from second.spec should not have run');
  });
  it('another test that should NOT run', () => {
    throw new Error('This test from second.spec should not have run either');
  });
});`
      );
    });
    it('bit test should only run the test with .only and skip the entire second spec file', () => {
      const output = helper.command.test('', true);
      // The test with .only should run
      expect(output).to.have.string('should run this test');
      // The second test in first.spec should not run
      expect(output).to.not.have.string('should NOT run this test');
      // No tests from second.spec should run at all
      expect(output).to.not.have.string('second spec file');
      expect(output).to.not.have.string('should NOT run - no .only in this file');
      expect(output).to.not.have.string('another test that should NOT run');
      // Should show only 1 passing test, not 2
      expect(output).to.have.string('1 passing');
      expect(output).to.not.have.string('2 passing');
    });
  });
});

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

function specFileWithErrorInBeforeHook() {
  return `import { expect } from 'chai';

describe('test', () => {
  // @ts-ignore
  before(() => {
    throw new Error('SomeError');
  });
  it('should not reach here', () => {
    expect(true).to.be.true;
  });
});
`;
}
