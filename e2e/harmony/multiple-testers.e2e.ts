import chai, { expect } from 'chai';
import { IS_WINDOWS } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

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
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      compName = helper.fixtures.populateComponents(1);
      helper.fs.outputFile('comp1/comp1.spec.ts', specFilePassingFixture());
      helper.fs.outputFile('comp1/comp1.custom-pattern-1.spec.ts', specFilePassingFixture('custom-pattern-1 describe text', 'custom-pattern-1 it text'));
      helper.fs.outputFile('comp1/comp1.custom-pattern-2.spec.ts', specFilePassingFixture('custom-pattern-2 describe text', 'custom-pattern-2 it text'));
      helper.env.setCustomEnv('multi-jest-testers-env');
      helper.command.compile();
      helper.command.install();
      helper.command.setEnv('comp1', 'multi-jest-testers-env');
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
      it('bit test should mentions the custom-pattern-1 spec file', () => {
        expect(output).to.have.string('comp1.custom-pattern-1.spec');
      });
      it('bit test should show the passing custom-pattern-1 spec via Jest output', () => {
        expect(output).to.have.string('✓ custom-pattern-1 it text');
      });
      it('bit test should mentions the custom-pattern-2 spec file', () => {
        expect(output).to.have.string('comp1.custom-pattern-2.spec');
      });
      it('bit test should show the passing custom-pattern-2 spec via Jest output', () => {
        expect(output).to.have.string('✓ custom-pattern-2 it text');
      });
    });
    describe('bit build command', () => {
      let output;
      before(() => {
        output = helper.command.build(compName, true);
      });
      it('bit test should run spec files in separate runs', () => {
        const matches = Array.from(output.matchAll(/Test Suites: 1 passed/g));
        const numOfTestSuites = matches.length;
        expect(numOfTestSuites).to.equal(2);
      });
      it('bit test should mentions the custom-pattern-1 spec file', () => {
        expect(output).to.have.string('comp1.custom-pattern-1.spec');
      });
      it('bit test should show the passing custom-pattern-1 spec via Jest output', () => {
        expect(output).to.have.string('✓ custom-pattern-1 it text');
      });
      it('bit test should mentions the custom-pattern-2 spec file', () => {
        expect(output).to.have.string('comp1.custom-pattern-2.spec');
      });
      it('bit test should show the passing custom-pattern-2 spec via Jest output', () => {
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

