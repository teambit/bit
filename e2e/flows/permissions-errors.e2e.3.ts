import { expect } from 'chai';

import Helper from '../../src/e2e-helper/e2e-helper';

/**
 * skipping the permissions tests as it won't be easy to have the CIs testing 'sudo' commands.
 * it does work locally though and is recommended to run it whenever this functionality is touched
 */
describe.skip('permissions', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('adding a component with sudo', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      const output = helper.command.runCmd('sudo bit add bar/foo.js');
      expect(output).to.have.string('Warning');
      expect(output).to.have.string('root');
    });
    describe('tagging the same component without sudo', () => {
      it('should show a descriptive error', () => {
        const output = helper.general.runWithTryCatch('bit tag -a');
        expect(output).to.have.string('error: you do not have permissions to access');
        expect(output).to.have.string('were you running bit, npm or git as root');
      });
    });
  });
});
