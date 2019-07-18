import { expect } from 'chai';
import Helper from '../e2e-helper';
import { statusWorkspaceIsCleanMsg } from '../../src/cli/commands/public-cmds/status-cmd';

chai.use(require('chai-fs'));

const helper = new Helper();

describe('angular', function () {
  this.timeout(0);
  after(() => {
    helper.destroyEnv();
  });
  describe('importing an ngx-bootstrap component from staging', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.setProjectAsAngular();
      helper.runCmd('bit import david.ngx/buttons');
    });
    it('bit status should show an error about missing tsconfig.json', () => {
      const output = helper.runCmd('bit status');
      expect(output).to.have.string('failed finding tsconfig.json file');
    });
    describe('after creating tsconfig.json file', () => {
      before(() => {
        helper.outputFile('tsconfig.json');
      });
      it('bit status should show a clean state', () => {
        const output = helper.runCmd('bit status');
        expect(output).to.have.a.string(statusWorkspaceIsCleanMsg);
      });
    });
  });
});
