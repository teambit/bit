import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('bit checkout command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.scopeHelper.reInitLocalScope();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('component with a non-exist package dependency which triggers the package-manager to fail', () => {
    let afterExport: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.dependenciesSet('comp1', 'bit-non-exist-pkg@1.0.0');
      helper.command.tagAllWithoutBuild('--ignore-issues="*"');
      helper.command.tagAllWithoutBuild('--unmodified --ignore-issues="*"');
      helper.command.export();
      afterExport = helper.scopeHelper.cloneLocalScope();
    });
    describe('bit checkout', () => {
      it('should not throw, instead, should show the error in the output', () => {
        const output = helper.command.checkoutVersion('0.0.1', 'comp1');
        expect(output).to.have.string('Installation Error');
        // this is the actual error coming from the package-manager
        // the full error is: `GET https://node-registry.bit.cloud/bit-non-exist-pkg: Not Found - 404`
        expect(output).to.have.string('404');
      });
    });
    describe('bit switch', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(afterExport);
        helper.command.createLane();
      });
      it('should not throw', () => {
        const output = helper.command.switchLocalLane('main');
        expect(output).to.have.string('Installation Error');
        expect(output).to.have.string('404');
      });
    });
    describe('bit import', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
      });
      it('should not throw', () => {
        const output = helper.command.importComponent('comp1');
        expect(output).to.have.string('Installation Error');
        expect(output).to.have.string('404');
      });
    });
  });
});
