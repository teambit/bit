import chai, { expect } from 'chai';
import { IssuesClasses } from '@teambit/component-issues';
import chaiString from 'chai-string';

import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
chai.use(chaiFs);
chai.use(chaiString);

describe('multiple envs', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)(
    'switching env with "bit env set" when both envs are not in the workspace and the previous env is in the model',
    () => {
      let envId1: string;
      let envId2: string;
      let npmCiRegistry: NpmCiRegistry;
      before(async () => {
        helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.workspaceJsonc.setPackageManager('teambit.dependencies/pnpm');
        npmCiRegistry = new NpmCiRegistry(helper);
        await npmCiRegistry.init();
        npmCiRegistry.configureCiInPackageJsonHarmony();
        helper.workspaceJsonc.setupDefault();
        const envName1 = helper.env.setCustomNewEnv(undefined, undefined, undefined, false);
        helper.env.setCustomNewEnv(undefined, undefined, undefined, true, 'react-based-env2', 'react-based-env2');
        envId1 = `${helper.scopes.remote}/${envName1}`;
        envId2 = `${helper.scopes.remote}/react-based-env2`;
        helper.fixtures.populateComponents(1);
        // set the env as a regular aspect (not via "bit env set"), so the .bitmap config has only
        // the env aspect entry without teambit.envs/envs. this is how the env ends up in the model
        // as __specific while the envs/envs entry is not.
        helper.command.setAspect('comp1', envId1);
        helper.command.compile();
        // tag with build, so the env packages are published with their dists and are loadable later on.
        helper.command.tagAllComponents();
        helper.command.export();

        // import comp1 into a new workspace without the envs, so the .bitmap entry has no config,
        // the previous env exists only in the model (marked there as __specific) and both envs
        // load from the packages rather than from the workspace.
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.workspaceJsonc.setupDefault();
        helper.command.importComponent('comp1', '-x');
        // the previous env exists only in the model. this env-set should replace it.
        helper.command.setEnv('comp1', envId2);
        helper.command.install();
      });
      after(() => {
        npmCiRegistry.destroy();
        helper = new Helper();
      });
      it('bit status should not show the MultipleEnvs issue because the previous env was replaced', () => {
        helper.command.expectStatusToNotHaveIssue(IssuesClasses.MultipleEnvs.name);
      });
      it('the env should be the newly set one', () => {
        const env = helper.env.getComponentEnv('comp1');
        expect(env).to.include(envId2);
      });
    }
  );
  describe('env in the variants and env in the .bitmap', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
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
