import fs from 'fs-extra';
import path from 'path';
import chai, { expect } from 'chai';

import Helper from '../../src/e2e-helper/e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

(supportNpmCiRegistryTesting ? describe : describe.skip)('dependencies in scope aspect capsules', function () {
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
  describe('using pnpm', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.extensions.bitJsonc.addKeyValToDependencyResolver('packageManager', `teambit.dependencies/pnpm`);
      helper.scopeHelper.addRemoteScope();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(2);
      helper.extensions.addExtensionToVariant('comp1', `${envId1}@0.0.1`);
      helper.extensions.addExtensionToVariant('comp2', `${envId2}@0.0.1`);
      const capsules = helper.command.capsuleListParsed();
      const scopeAspectCapsulesPath = capsules.scopeAspectsCapsulesRootDir;
      fs.removeSync(scopeAspectCapsulesPath);
      helper.command.status(); // populate capsules.
    });
    it('bit show should show the correct env', () => {
      const env1 = helper.env.getComponentEnv('comp1');
      expect(env1).to.equal(`${envId1}@0.0.1`);
      const env2 = helper.env.getComponentEnv('comp2');
      expect(env2).to.equal(`${envId2}@0.0.1`);
    });
    it('all packages are correctly installed inside capsules', () => {
      const { scopeAspectsCapsulesRootDir } = helper.command.capsuleListParsed();
      const capsuleDirs = fs.readdirSync(scopeAspectsCapsulesRootDir);
      const nodeEnv1CapsuleDir = path.join(
        scopeAspectsCapsulesRootDir,
        // eslint-disable-next-line
        capsuleDirs.find((dir) => dir.includes('node-env-1'))!
      );
      const nodeEnv2CapsuleDir = path.join(
        scopeAspectsCapsulesRootDir,
        // eslint-disable-next-line
        capsuleDirs.find((dir) => dir.includes('node-env-2'))!
      );
      expect(path.join(nodeEnv1CapsuleDir, 'node_modules/lodash.get')).to.be.a.path();
      expect(path.join(nodeEnv2CapsuleDir, 'node_modules/lodash.flatten')).to.be.a.path();
    });
  });
  describe('using Yarn', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.extensions.bitJsonc.addKeyValToDependencyResolver('packageManager', `teambit.dependencies/yarn`);
      helper.scopeHelper.addRemoteScope();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(2);
      helper.extensions.addExtensionToVariant('comp1', `${envId1}@0.0.1`);
      helper.extensions.addExtensionToVariant('comp2', `${envId2}@0.0.1`);
      const capsules = helper.command.capsuleListParsed();
      const scopeAspectCapsulesPath = capsules.scopeAspectsCapsulesRootDir;
      fs.removeSync(scopeAspectCapsulesPath);
      helper.command.status(); // populate capsules.
    });
    it('bit show should show the correct env', () => {
      const env1 = helper.env.getComponentEnv('comp1');
      expect(env1).to.equal(`${envId1}@0.0.1`);
      const env2 = helper.env.getComponentEnv('comp2');
      expect(env2).to.equal(`${envId2}@0.0.1`);
    });
    it('all packages are correctly installed inside capsules', () => {
      const { scopeAspectsCapsulesRootDir } = helper.command.capsuleListParsed();
      expect(path.join(scopeAspectsCapsulesRootDir, 'node_modules/lodash.get')).to.be.a.path();
      expect(path.join(scopeAspectsCapsulesRootDir, 'node_modules/lodash.flatten')).to.be.a.path();
    });
  });
  after(() => {
    npmCiRegistry.destroy();
  });
});
