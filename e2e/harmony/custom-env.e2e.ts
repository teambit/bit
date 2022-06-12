import fs from 'fs-extra';
import path from 'path';
import chai, { expect } from 'chai';
import { IssuesClasses } from '../../scopes/component/component-issues';
import { Extensions, IS_WINDOWS } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

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
  describe('non existing env', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
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
    describe('set up the env using bit env set without a version', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.addRemoteScope();
        helper.fixtures.populateComponents(1);
        helper.command.setEnv('comp1', envId);
      });
      it('should save it with the latest version in root', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.comp1.config).to.have.property(`${envId}@0.0.1`);
      });
    });
    describe('set up the env using bit env set with a version', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.addRemoteScope();
        helper.fixtures.populateComponents(1);
        helper.command.setEnv('comp1', `${envId}@0.0.1`);
      });
      it('should save it with a version in root but without version in envs/envs', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.comp1.config).to.have.property(`${envId}@0.0.1`);
        expect(bitMap.comp1.config[Extensions.envs].env).equal(envId);
      });
    });
    describe('set up the env using bit create --env with a version', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.addRemoteScope();
        helper.command.create('aspect', 'comp1', `--env ${envId}@0.0.1`);
      });
      it('should save it with a version in root but without version in envs/envs', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.comp1.config).to.have.property(`${envId}@0.0.1`);
        expect(bitMap.comp1.config[Extensions.envs].env).equal(envId);
      });
    });
    describe('set up the env and then unset it', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.addRemoteScope();
        helper.fixtures.populateComponents(1);
        helper.command.setEnv('comp1', `${envId}@0.0.1`);
        helper.command.unsetEnv('comp1');
      });
      it('should remove the env not only from envs/envs but also from root', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.comp1.config).to.not.have.property(`${envId}@0.0.1`);
        expect(bitMap.comp1.config).to.not.have.property(Extensions.envs);
      });
    });
    describe('set up the env and then replace it with another env without mentioning the version', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.addRemoteScope();
        helper.fixtures.populateComponents(1);
        helper.command.setEnv('comp1', `${envId}@0.0.1`);
        helper.command.replaceEnv(envId, `${envId}@0.0.2`);
      });
      it('should save it with a version in root but without version in envs/envs', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.comp1.config).to.not.have.property(`${envId}@0.0.1`);
        expect(bitMap.comp1.config).to.have.property(`${envId}@0.0.2`);
        expect(bitMap.comp1.config[Extensions.envs].env).equal(envId);
      });
    });

    describe('missing modules in the env capsule', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.addRemoteScope();
        helper.bitJsonc.setupDefault();
        helper.fixtures.populateComponents(1);
        helper.extensions.addExtensionToVariant('*', `${envId}@0.0.1`);
        helper.command.status(); // populate capsules.
        const capsules = helper.command.capsuleListParsed();
        const scopeAspectCapsulesPath = capsules.scopeAspectsCapsulesRootDir;
        fs.removeSync(path.join(scopeAspectCapsulesPath, 'node_modules'));
      });
      it('should re-create the capsule dir and should not show any warning/error about loading the env', () => {
        const status = helper.command.status();
        expect(status).to.not.include('unable to load the extension');
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
  describe('when the env is tagged and set in workspace.jsonc without exporting it', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      // important! don't disable the preview.
      helper.bitJsonc.addDefaultScope();
      const envName = helper.env.setCustomEnv();
      const envId = `${helper.scopes.remote}/${envName}`;
      helper.extensions.addExtensionToWorkspace(envId);
      helper.command.tagAllWithoutBuild();
    });
    // previously, it errored "error: component "n8w0pqms-local/3wc3xd3p-remote/node-env@0.0.1" was not found"
    it('should be able to re-tag with no errors', () => {
      // important! don't skip the build. it's important for the Preview task to run.
      expect(() => helper.command.tagIncludeUnmodified()).not.to.throw();
    });
  });
  describe('when the env is exported to a remote scope and is not exist locally', () => {
    let envId: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      const envName = helper.env.setCustomEnv();
      envId = `${helper.scopes.remote}/${envName}`;
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.fixtures.populateComponents(1);
    });
    // previously, it errored "Cannot read property 'id' of undefined"
    it('bit env-set should not throw any error', () => {
      expect(() => helper.command.setEnv('comp1', envId));
    });
  });
});

function getEnvIdFromModel(compModel: any): string {
  const envEntry = compModel.extensions.find((ext) => ext.name === 'teambit.envs/envs');
  const envId = envEntry.data.id;
  return envId;
}
