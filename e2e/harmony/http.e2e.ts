import { expect } from 'chai';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper from '../../src/e2e-helper/e2e-helper';
import { HttpHelper } from '../http-helper';

// @todo: for some reason it fails on the CI. Maybe due to the browser opening.
describe('http protocol', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  let httpHelper: HttpHelper;
  describe('export', () => {
    let exportOutput;
    before(async () => {
      httpHelper = new HttpHelper(helper);
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.addDefaultScope();
      helper.bitJsonc.disablePreview();
      helper.extensions.addExtensionToVariant('*', 'teambit.react/react', {});
      await httpHelper.start();
      helper.scopeHelper.addRemoteHttpScope();
      helper.fixtures.populateComponents();
      helper.command.linkAndRewire();
      helper.command.tagAllComponents();
      exportOutput = helper.command.exportAllComponents();
    });
    after(() => {
      httpHelper.killHttp();
    });
    it('should export successfully', () => {
      expect(exportOutput).to.have.string('exported 3 components');
    });
    describe('bit import', () => {
      let importOutput;
      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.addRemoteHttpScope();
        importOutput = helper.command.importComponent('comp1');
      });
      it('should import successfully', () => {
        expect(importOutput).to.have.string('successfully imported one component');
      });
    });
  });
});
