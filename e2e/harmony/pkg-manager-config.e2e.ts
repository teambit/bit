import path from 'path';
import { expect } from 'chai';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';
import type { ModulesManifest } from '../modules-manifest';
import { readModulesManifest } from '../modules-manifest';

(supportNpmCiRegistryTesting ? describe : describe.skip)(
  'workspace package-manager config is read when installation is in a capsule',
  function () {
    this.timeout(0);
    let helper: Helper;
    let envId1;
    let envName1;
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.workspaceJsonc.setPackageManager('teambit.dependencies/pnpm');
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      envName1 = helper.env.setCustomEnv('node-env-1');
      envId1 = `${helper.scopes.remote}/${envName1}`;
      helper.command.install('lodash.get lodash.flatten');
      helper.command.compile();
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.workspaceJsonc.setupDefault();
    });
    describe('using pnpm', () => {
      let modulesState: ModulesManifest | null;
      before(async () => {
        helper.scopeHelper.reInitWorkspace();
        helper.fs.outputFile('pnpm-workspace.yaml', 'hoistPattern:\n  - capsule-hoist-pattern\n');
        helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('packageManager', `teambit.dependencies/pnpm`);
        helper.scopeHelper.addRemoteScope();
        helper.workspaceJsonc.setupDefault();
        helper.workspaceJsonc.addKeyValToWorkspace('resolveAspectsFromNodeModules', false);
        helper.workspaceJsonc.addKeyValToWorkspace('resolveEnvsFromRoots', false);
        helper.fixtures.populateComponents(1);
        helper.extensions.addExtensionToVariant('comp1', `${envId1}@0.0.1`);
        helper.capsules.removeScopeAspectCapsules();
        helper.command.status(); // populate capsules.

        const { scopeAspectsCapsulesRootDir } = helper.command.capsuleListParsed();
        modulesState = await readModulesManifest(
          path.join(scopeAspectsCapsulesRootDir, `${helper.scopes.remote}_node-env-1@0.0.1/node_modules`)
        );
      });
      it('workspace pnpm config is taken into account when running install in the capsule', () => {
        expect(modulesState?.hoistPattern).to.include('capsule-hoist-pattern');
      });
    });
    after(() => {
      npmCiRegistry.destroy();
    });
  }
);
