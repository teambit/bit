import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';

chai.use(chaiFs);

describe('Mocha Tester - spec files handling', function () {
  this.timeout(0);
  let helper: Helper;
  let envId: string;
  let envName: string;

  const setupMochaEnv = () => {
    envName = helper.env.setCustomNewEnv('mocha-only-test-env', [
      '@teambit/typescript.typescript-compiler',
      '@teambit/defender.mocha-tester',
      'chai',
      'chai-fs',
      '@babel/preset-typescript',
      '@babel/preset-env',
    ]);
    envId = `${helper.scopes.remote}/${envName}`;
  };

  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('typescript component', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponentsTS(1);
      setupMochaEnv();
      helper.command.setEnv('comp1', envId);
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
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(1);
      setupMochaEnv();
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
  describe('testing a single spec file', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(2);
      setupMochaEnv();
      helper.command.setEnv('comp1', envId);
      helper.command.setEnv('comp2', envId);
      helper.command.install();
      helper.fs.outputFile('comp1/first.spec.ts', specFileWithNamesFixture('first spec file', 'first-file test'));
      helper.fs.outputFile('comp1/second.spec.ts', specFileWithNamesFixture('second spec file', 'second-file test'));
      helper.fs.outputFile('comp2/comp2.spec.ts', specFileWithNamesFixture('comp2 spec file', 'comp2 test'));
    });
    it('should run only the tests of the given file', () => {
      const output = helper.command.test('comp1/first.spec.ts', true);
      expect(output).to.have.string('first-file test');
      expect(output).to.not.have.string('second-file test');
      expect(output).to.not.have.string('comp2 test');
      expect(output).to.have.string('1 passing');
    });
    it('should test only the component that owns the given file', () => {
      const output = helper.command.test('comp1/first.spec.ts', true);
      expect(output).to.have.string('testing total of 1 components');
    });
    it('should support multiple test-file paths', () => {
      const output = helper.command.test('comp1/first.spec.ts comp1/second.spec.ts', true);
      expect(output).to.have.string('first-file test');
      expect(output).to.have.string('second-file test');
      expect(output).to.not.have.string('comp2 test');
      expect(output).to.have.string('2 passing');
    });
  });
});

function specFileWithNamesFixture(describeText: string, itText: string) {
  return `import { expect } from 'chai';
describe('${describeText}', () => {
  it('${itText}', () => {
    expect(true).to.be.true;
  });
});
`;
}
