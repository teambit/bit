import { expect } from 'chai';
import Helper from '../e2e-helper';

describe('bit list command', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('when no components created', () => {
    before(() => {
      helper.cleanEnv();
      helper.runCmd('bit init');
    });
    it('should display "found 0 components"', () => {
      const output = helper.runCmd('bit list');
      expect(output.includes('found 0 components')).to.be.true;
    });
  });
  describe('when a component is created but not committed', () => {
    before(() => {
      helper.cleanEnv();
      helper.runCmd('bit init');
      helper.createComponentBarFoo();
    });
    it('should display "found 0 components"', () => {
      const output = helper.runCmd('bit list');
      expect(output.includes('found 0 components')).to.be.true;
    });
  });
  describe.only('when a component is created and committed', () => {
    before(() => {
      helper.cleanEnv();
      helper.runCmd('bit init');
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
    });
    it('should display "found 1 components"', () => {
      const output = helper.runCmd('bit list');
      expect(output.includes('found 1 components')).to.be.true;
    });
    it('should list deprecated component', () => {
      helper.deprecateComponent('bar/foo');
      const output = helper.runCmd('bit list');
      expect(output).to.contain.string('bar/foo [Deprecated]');
    });
  });
});
