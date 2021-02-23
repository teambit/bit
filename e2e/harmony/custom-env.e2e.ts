import chai, { expect } from 'chai';

import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

describe('custom env', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('custom env with 3 components', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      const envName = helper.env.setCustomEnv();
      helper.fixtures.populateComponents(3);
      helper.extensions.addExtensionToVariant('*', `${helper.scopes.remote}/${envName}`);
      helper.command.compile();
    });
    describe('untag', () => {
      before(() => {
        helper.command.tagAllWithoutBuild();
      });
      // previously it used to throw "error: component "node-env@0.0.1" was not found."
      it('should untag successfully', () => {
        expect(() => helper.command.untag('--all')).to.not.throw();
      });
    });
  });
});
