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
  describe('env in the variants and env in the .bitmap', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesWithDefault();
      helper.fixtures.populateComponents(1);
      const reactEnv = 'teambit.react/react';
      helper.extensions.addExtensionToVariant('*', reactEnv);
      // as an intermediate step, make sure the env is react.
      const env = helper.env.getComponentEnv('comp1');
      expect(env).to.equal(reactEnv);

      helper.command.setEnv('comp1', 'teambit.harmony/aspect');
    });
    it('bit status should not show it as an issue because the previous env was removed', () => {
      helper.command.expectStatusToNotHaveIssue(IssuesClasses.MultipleEnvs.name);
    });
    it('expect the env to be the one that was set in the .bitmap file', () => {
      const env = helper.env.getComponentEnv('comp1');
      expect(env).to.equal('teambit.harmony/aspect');
    });
  });
  describe('env in the variants global (*) and env in the variants more specific', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesWithDefault();
      helper.fixtures.populateComponents(1);
      const reactEnv = 'teambit.react/react';
      helper.extensions.addExtensionToVariant('*', reactEnv);
      helper.extensions.addExtensionToVariant('comp1', 'teambit.harmony/aspect');
    });
    it('bit status should show it as an issue', () => {
      helper.command.expectStatusToHaveIssue(IssuesClasses.MultipleEnvs.name);
    });
    it('bit env set should fix the issue', () => {
      helper.command.setEnv('comp1', 'teambit.harmony/aspect');
      helper.command.expectStatusToNotHaveIssue(IssuesClasses.MultipleEnvs.name);
    });
  });
});
