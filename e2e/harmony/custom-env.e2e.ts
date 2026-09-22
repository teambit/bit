import fs from 'fs-extra';
import path from 'path';
import stripAnsi from 'strip-ansi';
import chai, { expect } from 'chai';
import { IssuesClasses } from '@teambit/component-issues';
import { IS_WINDOWS } from '@teambit/legacy.constants';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
import chaiString from 'chai-string';
chai.use(chaiFs);
chai.use(chaiString);
describe('custom env', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('non existing env', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.extensions.addExtensionToVariant('*', 'company.scope/envs/fake-env');
    });
    // before, it was throwing: "company.scope: access denied"
    it('bit status should show a descriptive error', () => {
      expect(() => helper.command.status()).to.throw(
        'unable to import the following component(s): company.scope/envs/fake-env'
      );
    });
  });
  describe('non loaded env', () => {
    let envId;
    let envName;
    before(async () => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.workspaceJsonc.setPackageManager('teambit.dependencies/pnpm');
      // the node-env-1 fixture is a minimal old-format env (not based on any non-core env), so
      // the suite doesn't pay the full published env-chain installs - see the fixture itself
      envName = helper.env.setCustomEnv('node-env-1', { skipCompile: true, skipInstall: true });
      envId = `${helper.scopes.remote}/${envName}`;
      helper.fixtures.populateComponents(1, undefined, undefined, false);
      helper.extensions.addExtensionToVariant('*', envId);
      // Clean the node_modules as we want to run tests when node_modules is empty
      fs.rmdirSync(path.join(helper.scopes.localPath, 'node_modules'), { recursive: true });
    });
    it('should show the correct env in bit show (with no loaded indication)', () => {
      const componentShowParsed = helper.command.showComponentParsedHarmonyByTitle('comp1', 'env');
      expect(componentShowParsed).to.equal(envId);
      const regularShowOutput = helper.command.showComponent('comp1');
      expect(stripAnsi(regularShowOutput)).to.contain(`${envId} (not loaded)`);
    });
    it('should show the correct env in bit envs (with no loaded indication)', () => {
      const envsOutput = helper.command.envs();
      expect(stripAnsi(envsOutput)).to.contain(`${envId} (not loaded)`);
    });
    it('should show a component issue in bit status', () => {
      helper.command.expectStatusToHaveIssue(IssuesClasses.NonLoadedEnv.name);
    });
  });
  describe('custom env with 3 components', () => {
    let wsAllNew;
    let envId;
    let envName;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      envName = helper.env.setCustomEnv('node-env-1');
      envId = `${helper.scopes.remote}/${envName}`;
      helper.fixtures.populateComponents(3);
      helper.extensions.addExtensionToVariant('*', envId);
      helper.command.compile();
      wsAllNew = helper.scopeHelper.cloneWorkspace(IS_WINDOWS);
    });
    describe('tag', () => {
      before(() => {
        helper.command.tagAllWithoutBuild();
      });
      it('should have the correct env in the envs aspect data', () => {
        const comp1 = helper.command.catComponent('comp1@latest');
        const envIdFromModel = getEnvIdFromModel(comp1);
        expect(envIdFromModel).to.equal(envId);
      });
      describe('tag again', () => {
        before(() => {
          // helper.command.tagWithoutBuild(envName, '-f');
          helper.command.tagComponent(envName, 'message', '--unmodified');
        });
        it('should have the correct env in the envs aspect data after additional tag', () => {
          const comp1 = helper.command.catComponent('comp1@latest');
          const envIdFromModel = getEnvIdFromModel(comp1);
          expect(envIdFromModel).to.equal(`${envId}`);
        });
      });
    });
    describe('untag', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(wsAllNew);
        helper.command.tagAllWithoutBuild();
      });
      // previously it used to throw "error: component "node-env@0.0.1" was not found."
      it('should untag successfully', () => {
        expect(() => helper.command.reset('--all')).to.not.throw();
      });
    });
    describe('out-of-sync scenario where the id is changed during the process', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(wsAllNew);
        helper.command.tagAllWithoutBuild();
        const bitMapBeforeExport = helper.bitMap.read();
        helper.command.export();
        helper.bitMap.write(bitMapBeforeExport);
      });
      it('bit status should not throw ComponentNotFound error', () => {
        expect(() => helper.command.status()).not.to.throw();
      });
    });
  });
  describe('change an env after tag', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const envName = helper.env.setCustomEnv('node-env-1');
      const envId = `${helper.scopes.remote}/${envName}`;
      helper.fixtures.populateComponents(3);
      helper.extensions.addExtensionToVariant('*', envId);
      helper.command.compile();
      helper.command.tagAllWithoutBuild();
      const newEnvId = 'teambit.react/react';
      helper.extensions.addExtensionToVariant('*', newEnvId, undefined, true);
    });
    it('bit status should show it as an issue because the previous env was not removed', () => {
      helper.command.expectStatusToHaveIssue(IssuesClasses.MultipleEnvs.name);
    });
  });
  describe('change an env after tag2 and then change it back to the custom-env in the workspace', () => {
    let envId;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const envName = helper.env.setCustomEnv('node-env-1');
      envId = `${helper.scopes.remote}/${envName}`;
      helper.fixtures.populateComponents(1, false);
      helper.command.setEnv('comp1', envId);
      helper.command.compile();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      const newEnvId = 'teambit.react/react';
      helper.command.setEnv('comp1', newEnvId);
      helper.command.setEnv('comp1', envId);
    });
    // previous bug was showing the custom-env with minus in .bitmap and then again with an empty object, causing the
    // env to fallback to node.
    it('should have the correct env', () => {
      const env = helper.env.getComponentEnv('comp1');
      expect(env).to.include(envId);
    });
  });
});

function getEnvIdFromModel(compModel: any): string {
  const envEntry = compModel.extensions.find((ext) => ext.name === 'teambit.envs/envs');
  const envId = envEntry.data.id;
  return envId;
}
