import fs from 'fs-extra';
import path from 'path';
import chai, { expect } from 'chai';

import Helper from '../../src/e2e-helper/e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';
import { UNABLE_TO_LOAD_EXTENSION } from '../../scopes/harmony/aspect-loader/constants';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

(supportNpmCiRegistryTesting ? describe : describe.skip)('custom env installed as a package', function () {
  this.timeout(0);
  let helper: Helper;
  let envId1;
  let envName1;
  let envId2;
  let envName2;
  let npmCiRegistry: NpmCiRegistry;
  before(async () => {
    helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
    helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
    helper.bitJsonc.setupDefault();
    helper.bitJsonc.setPackageManager();
    npmCiRegistry = new NpmCiRegistry(helper);
    await npmCiRegistry.init();
    npmCiRegistry.configureCiInPackageJsonHarmony();
    envName1 = helper.env.setCustomEnv('node-env-1');
    envId1 = `${helper.scopes.remote}/${envName1}`;
    envName2 = helper.env.setCustomEnv('node-env-2');
    envId2 = `${helper.scopes.remote}/${envName2}`;
    helper.command.install('lodash.get lodash.flatten');
    helper.command.compile();
    helper.command.tagAllComponents();
    helper.command.export();

    helper.scopeHelper.reInitLocalScopeHarmony();
    helper.scopeHelper.addRemoteScope();
    helper.bitJsonc.setupDefault();
  });
  describe('setting up the external env without a version', () => {
    before(() => {
      helper.fixtures.populateComponents(2);
      helper.extensions.addExtensionToVariant('*', envId1);
      helper.extensions.addExtensionToVariant('*', envId2);
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
      helper.fixtures.populateComponents(2);
      helper.extensions.addExtensionToVariant('comp1', `${envId1}@0.0.1`);
      helper.extensions.addExtensionToVariant('comp2', `${envId2}@0.0.1`);
      helper.command.status(); // populate capsules.
      const capsules = helper.command.capsuleListParsed();
      const scopeAspectCapsulesPath = capsules.scopeAspectsCapsulesRootDir;
      fs.removeSync(path.join(scopeAspectCapsulesPath, 'node_modules'));
    });
    it('should re-create the capsule dir and should not show any warning/error about loading the env', () => {
      const status = helper.command.status();
      const errMsg = UNABLE_TO_LOAD_EXTENSION(`${envId1}@0.0.1`);
      expect(status).to.not.include(errMsg);
    });
    it('bit show should show the correct env', () => {
      const env1 = helper.env.getComponentEnv('comp1');
      expect(env1).to.equal(`${envId1}@0.0.1`);
      const env2 = helper.env.getComponentEnv('comp2');
      expect(env2).to.equal(`${envId2}@0.0.1`);
    });
    it('all packages are correctly installed inside capsules', () => {
      const { scopeAspectsCapsulesRootDir } = helper.command.capsuleListParsed()
      const capsuleDirs = fs.readdirSync(scopeAspectsCapsulesRootDir)
      const nodeEnv1CapsuleDir = path.join(scopeAspectsCapsulesRootDir, capsuleDirs.find((dir) => dir.includes('node-env-1'))!)
      const nodeEnv2CapsuleDir = path.join(scopeAspectsCapsulesRootDir, capsuleDirs.find((dir) => dir.includes('node-env-2'))!)
      expect(path.join(nodeEnv1CapsuleDir, 'node_modules/lodash.get')).to.be.a.path()
      expect(path.join(nodeEnv2CapsuleDir, 'node_modules/lodash.flatten')).to.be.a.path()
    })
  });
  after(() => {
    npmCiRegistry.destroy();
  });
});
