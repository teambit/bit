import { expect } from 'chai';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('log', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('logging with global --log flag', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
    });
    it('should log successfully', () => {
      const output = helper.command.runCmd('bit status --log');
      expect(output).to.have.string('ComponentLoader, loading consumer-components from the file-system');
    });
  });
});
