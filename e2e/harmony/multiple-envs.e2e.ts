import chai, { expect } from 'chai';
import { IssuesClasses } from '../../scopes/component/component-issues';

import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

describe('multiple envs', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('change an env after tag', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      const reactEnv = 'teambit.react/react';
      helper.extensions.addExtensionToVariant('*', reactEnv);
      // as an intermediate step, make sure the env is react.
      const env = helper.env.getComponentEnv('comp1');
      expect(env).to.equal(reactEnv);

      helper.command.setEnv('comp1', 'teambit.harmony/aspect');
    });
    it('bit status should show it as an issue because the previous env was not removed', () => {
      helper.command.expectStatusToNotHaveIssue(IssuesClasses.MultipleEnvs.name);
    });
    it('expect the env to be the one that was set in the .bitmap file', () => {
      const env = helper.env.getComponentEnv('comp1');
      expect(env).to.equal('teambit.harmony/aspect');
    });
  });
});
