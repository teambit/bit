import { expect } from 'chai';
import Helper from '../e2e-helper';

const helper = new Helper();

describe('bit list command', function () {
  this.timeout(0);
  describe('when no components created', () => {
    before(() => {
      helper.cleanEnv();
      helper.runCmd('bit init');
    });
    it('should display "Total 0 components"', () => {
      const output = helper.runCmd('bit list');
      expect(output.includes('Total 0 components')).to.be.true;
    });
  });
  describe('when a component is created but not committed', () => {
    before(() => {
      helper.cleanEnv();
      helper.runCmd('bit init');
      helper.runCmd('bit create foo');
    });
    it('should display "Total 0 components"', () => {
      const output = helper.runCmd('bit list');
      expect(output.includes('Total 0 components')).to.be.true;
    });
  });
  describe('when a component is created and committed', () => {
    before(() => {
      helper.cleanEnv();
      helper.runCmd('bit init');
      helper.runCmd('bit create foo');
      helper.runCmd('bit commit foo commit-msg');
    });
    it('should display "Total 1 components"', () => {
      const output = helper.runCmd('bit list');
      expect(output.includes('Total 1 components')).to.be.true;
    });
  });
});
