import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.setEnv('comp1', 'teambit.harmony/envs/core-aspect-env@0.0.42');
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
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.populateComponentsTS(1);
      helper.command.setEnv('comp1', 'teambit.harmony/envs/core-aspect-env@0.0.42');
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
