import chai, { expect } from 'chai';
import chaiFs from 'chai-fs';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(chaiFs);

describe('test command on Harmony', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('component with an empty test file', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile('comp1/comp1.spec.js');
    });
    it('--junit should show the error', () => {
      expect(() => helper.command.testAllWithJunit()).to.throw();
      const junitFile = helper.fs.readFile('junit.xml');
      expect(junitFile).to.include('errors="1"');
      expect(junitFile).to.include('Your test suite must contain at least one test');
    });
  });
  describe('passing test-file paths instead of a component pattern', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile(
        'comp1/comp1.spec.ts',
        `it('should pass', () => { expect(true).toBeTruthy(); });
`
      );
    });
    it('should throw a descriptive error when the file is not a test file of the component', () => {
      const output = helper.general.runWithTryCatch('bit test comp1/index.js');
      expect(output).to.have.string('is not a recognized test file');
      expect(output).to.have.string('comp1.spec.ts');
    });
    it('should throw when the file does not belong to any component', () => {
      helper.fs.outputFile('some-file.spec.ts', '');
      const output = helper.general.runWithTryCatch('bit test some-file.spec.ts');
      expect(output).to.have.string('does not belong to any component');
    });
    it('should throw when mixing test-file paths with component patterns', () => {
      const output = helper.general.runWithTryCatch('bit test comp1 comp1/comp1.spec.ts');
      expect(output).to.have.string('unable to mix test-file paths with component patterns');
    });
  });
});
