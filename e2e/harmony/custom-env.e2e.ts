import fs from 'fs-extra';
import path from 'path';
import chai, { expect } from 'chai';
import { IssuesClasses } from '../../scopes/component/component-issues';

import { IS_WINDOWS } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';
import { UNABLE_TO_LOAD_EXTENSION } from '../../scopes/harmony/aspect-loader/constants';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

describe('custom env', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('custom env with 3 components', () => {
    let wsAllNew;
    let envId;
    let envName;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.bitJsonc.setPackageManager();
      envName = helper.env.setCustomEnv();
      envId = `${helper.scopes.remote}/${envName}`;
      helper.fixtures.populateComponents(3);
      helper.extensions.addExtensionToVariant('*', envId);
      helper.command.compile();
      wsAllNew = helper.scopeHelper.cloneLocalScope(IS_WINDOWS);
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
          helper.command.tagComponent(envName, 'message', '-f');
        });
        it('should have the correct env in the envs aspect data after additional tag', () => {
          const comp1 = helper.command.catComponent('comp1@latest');
          const envIdFromModel = getEnvIdFromModel(comp1);
          expect(envIdFromModel).to.equal(`${envId}@0.0.2`);
        });
      });
    });
    describe('untag', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(wsAllNew);
        helper.command.tagAllWithoutBuild();
      });
      // previously it used to throw "error: component "node-env@0.0.1" was not found."
      it('should untag successfully', () => {
        expect(() => helper.command.untag('--all')).to.not.throw();
      });
    });
    describe('out-of-sync scenario where the id is changed during the process', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(wsAllNew);
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
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.bitJsonc.setPackageManager();
      const envName = helper.env.setCustomEnv();
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
  (supportNpmCiRegistryTesting ? describe : describe.skip)('custom env installed as a package', () => {
    let envId;
    let envName;
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.bitJsonc.setPackageManager();
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      envName = helper.env.setCustomEnv();
      envId = `${helper.scopes.remote}/${envName}`;
      helper.command.compile();
      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.bitJsonc.setupDefault();
    });
    describe('setting up the external env without a version', () => {
      before(() => {
        helper.fixtures.populateComponents(1);
        helper.extensions.addExtensionToVariant('*', envId);
      });
      it('should show a descriptive error when tagging the component', () => {
        expect(() => helper.command.tagAllComponents()).to.throw(
          `if this is an external env/extension/aspect configured in workspace.jsonc, make sure it is set with a version`
        );
      });
      describe('running any other command', () => {
        // @Gilad TODO
        it.skip('should warn or error about the misconfigured env and suggest to enter the version', () => {});
      });
    });
    describe('missing modules in the env capsule', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.addRemoteScope();
        helper.bitJsonc.setupDefault();
        helper.fixtures.populateComponents(1);
        helper.extensions.addExtensionToVariant('*', `${envId}@0.0.1`);
        const capsules = helper.command.capsuleListParsed();
        const scopeAspectCapsulesPath = capsules.scopeAspectsCapsulesRootDir;
        fs.removeSync(path.join(scopeAspectCapsulesPath, 'node_modules'));
      });
      it('should re-create the capsule dir and should not show any warning/error about loading the env', () => {
        const status = helper.command.status();
        const errMsg = UNABLE_TO_LOAD_EXTENSION(`${envId}@0.0.1`);
        expect(status).to.not.include(errMsg);
      });
      it('bit show should show the correct env', () => {
        const env = helper.env.getComponentEnv('comp1');
        expect(env).to.equal(`${envId}@0.0.1`);
      });
    });
    after(() => {
      npmCiRegistry.destroy();
    });
  });
});

function getEnvIdFromModel(compModel: any): string {
  const envEntry = compModel.extensions.find((ext) => ext.name === 'teambit.envs/envs');
  const envId = envEntry.data.id;
  return envId;
}
