import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

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
      helper.scopeHelper.reInitLocalScope();
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
});
