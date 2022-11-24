import path from 'path';
import chai, { expect } from 'chai';
import { readModulesManifest } from '@pnpm/modules-yaml';

import Helper from '../../src/e2e-helper/e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

(supportNpmCiRegistryTesting ? describe : describe.skip)(
  'package manager rc file is read from the workspace directory when installation is in a capsule',
  function () {
    this.timeout(0);
    let helper: Helper;
    let envId1;
    let envName1;
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopesWithDefault();
      helper.bitJsonc.setPackageManager();
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      envName1 = helper.env.setCustomEnv('node-env-1');
      envId1 = `${helper.scopes.remote}/${envName1}`;
      helper.command.install('lodash.get lodash.flatten');
      helper.command.compile();
      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.bitJsonc.setupDefault();
    });
    describe('using Yarn', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope({
          yarnRCConfig: {
            packageExtensions: {
              'lodash.get@*': {
                dependencies: {
                  'is-positive': '1.0.0',
                },
              },
            },
          },
        });
        helper.extensions.bitJsonc.addKeyValToDependencyResolver('packageManager', `teambit.dependencies/yarn`);
        helper.scopeHelper.addRemoteScope();
        helper.bitJsonc.setupDefault();
        helper.fixtures.populateComponents(1);
        helper.extensions.addExtensionToVariant('comp1', `${envId1}@0.0.1`);
        helper.capsules.removeScopeAspectCapsules();
        helper.command.status(); // populate capsules.
      });
      it('packageExtensions is taken into account when running install in the capsule', () => {
        const { scopeAspectsCapsulesRootDir } = helper.command.capsuleListParsed();
        expect(path.join(scopeAspectsCapsulesRootDir, 'node_modules/is-positive')).to.be.a.path();
      });
    });
    describe('using pnpm', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope({
          npmrcConfig: {
            'hoist-pattern[]': 'foo',
          },
        });
        helper.extensions.bitJsonc.addKeyValToDependencyResolver('packageManager', `teambit.dependencies/pnpm`);
        helper.scopeHelper.addRemoteScope();
        helper.bitJsonc.setupDefault();
        helper.fixtures.populateComponents(1);
        helper.extensions.addExtensionToVariant('comp1', `${envId1}@0.0.1`);
        helper.capsules.removeScopeAspectCapsules();
        helper.command.status(); // populate capsules.
      });
      it('workspace .npmrc is taken into account when running install in the capsule', async () => {
        const { scopeAspectsCapsulesRootDir } = helper.command.capsuleListParsed();
        const modulesState = await readModulesManifest(path.join(scopeAspectsCapsulesRootDir, 'node_modules'));
        expect(modulesState?.hoistPattern?.[0]).to.eq('foo');
      });
    });
    after(() => {
      npmCiRegistry.destroy();
    });
  }
);
