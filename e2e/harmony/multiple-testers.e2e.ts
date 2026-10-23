import { expect } from 'chai';
import { IS_WINDOWS } from '@teambit/legacy.constants';
import { Helper } from '@teambit/legacy.e2e-helper';

describe('multi testers', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  (IS_WINDOWS ? describe.skip : describe)('2 jest testers with different resolve pattern', function () {
    let compName;
    let envId;
    let envName;
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      compName = helper.fixtures.populateComponents(1);
      helper.fs.outputFile('comp1/comp1.spec.ts', specFilePassingFixture());
      helper.fs.outputFile(
        'comp1/comp1.custom-pattern-1.spec.ts',
        specFilePassingFixture('custom-pattern-1 describe text', 'custom-pattern-1 it text')
      );
      helper.fs.outputFile(
        'comp1/comp1.custom-pattern-2.spec.ts',
        specFilePassingFixture('custom-pattern-2 describe text', 'custom-pattern-2 it text')
      );
      envName = helper.env.setCustomNewEnv('multi-jest-testers-env', [
        '@teambit/react.react-env',
        '@teambit/typescript.typescript-compiler',
        '@teambit/defender.jest-tester',
        '@teambit/defender.testers.multi-tester',
      ]);
      envId = `${helper.scopes.remote}/${envName}`;
      helper.command.setEnv('comp1', envId);
      helper.command.install();
    });
    describe('bit test command', () => {
      let output;
      before(() => {
        output = helper.command.test('', true);
      });
      it('bit test should run spec files in separate runs', () => {
        const matches = Array.from(output.matchAll(/Test Suites: 1 passed/g));
        const numOfTestSuites = matches.length;
        expect(numOfTestSuites).to.equal(2);
      });
      // the "mentions the spec file" assertions used to be their own its, but a passing "✓ <it text>"
      // already implies jest picked the file up. they assert on the same captured output, so they are
      // co-located here rather than spread over four its.
      it('bit test should run and pass the custom-pattern-1 spec via Jest output', () => {
        expect(output).to.have.string('comp1.custom-pattern-1.spec');
        expect(output).to.have.string('✓ custom-pattern-1 it text');
      });
      it('bit test should run and pass the custom-pattern-2 spec via Jest output', () => {
        expect(output).to.have.string('comp1.custom-pattern-2.spec');
        expect(output).to.have.string('✓ custom-pattern-2 it text');
      });
    });
    describe('bit build command', () => {
      let output;
      before(() => {
        output = helper.command.build(compName, undefined, true);
      });
      it('test task should run spec files in separate runs', () => {
        const matches = Array.from(output.matchAll(/Test Suites: 1 passed/g));
        const numOfTestSuites = matches.length;
        expect(numOfTestSuites).to.equal(2);
      });
      // titles here used to say "bit test" - copy-pasted from the describe above. this describe runs
      // "bit build", which reaches the testers through MultiTesterTask rather than through the env's
      // tester() handler, so it is a genuinely different wiring and is kept.
      it('bit build should run and pass the custom-pattern-1 spec via Jest output', () => {
        expect(output).to.have.string('comp1.custom-pattern-1.spec');
        expect(output).to.have.string('✓ custom-pattern-1 it text');
      });
      it('bit build should run and pass the custom-pattern-2 spec via Jest output', () => {
        expect(output).to.have.string('comp1.custom-pattern-2.spec');
        expect(output).to.have.string('✓ custom-pattern-2 it text');
      });
    });
  });
});

function specFilePassingFixture(describeText = 'test', itText = 'should pass') {
  return `describe('${describeText}', () => {
  it('${itText}', () => {
    expect(true).toBeTruthy();
  });
});
`;
}
