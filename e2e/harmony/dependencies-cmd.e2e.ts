import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('bit dependencies command', function () {
  let helper: Helper;
  this.timeout(0);
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('running the command on a new component', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fixtures.populateComponents(1);
    });
    it('should not throw an error saying the id is missing from the graph', () => {
      expect(() => helper.command.dependencies('comp1')).to.not.throw();
    });
  });
});
