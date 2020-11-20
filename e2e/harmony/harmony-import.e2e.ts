import chai, { expect } from 'chai';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('import component on Harmony', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('tag, export, clean scope objects, tag and export', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.disablePreview();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.git.mimicGitCloneLocalProjectHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.command.importAllComponents();
      helper.fixtures.populateComponents(1, undefined, ' v2');
      helper.command.tagAllComponents();
    });
    it('should export with no errors about missing artifacts (pkg file) from the first tag', () => {
      expect(() => helper.command.exportAllComponents()).to.not.throw();
    });
  });
});
