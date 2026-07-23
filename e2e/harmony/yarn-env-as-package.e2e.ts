import chai, { expect } from 'chai';
import chaiFs from 'chai-fs';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';

chai.use(chaiFs);

/**
 * the ".bit_roots" dir of an env installed from the registry is named with its version
 * (e.g. "my-org.my-scope_my-env@0.0.1"). yarn synthesizes the workspace ident of a project
 * with no package.json name from the directory basename, and an ident holding an extra "@"
 * doesn't survive yarn's locator stringify/parse round-trip - failing the resolution of the
 * project's file: dependencies with "isn't supported by any available fetcher".
 */
(supportNpmCiRegistryTesting ? describe : describe.skip)(
  'yarn install with an env installed as a package',
  function () {
    this.timeout(0);
    let helper: Helper;
    let envId: string;
    let envName: string;
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      helper.workspaceJsonc.setupDefault();
      envName = helper.env.setCustomNewEnv('node-based-env', ['@teambit/node.node'], {
        policy: {
          runtime: [
            {
              name: 'is-negative',
              version: '1.0.0',
              force: true,
            },
          ],
        },
      });
      envId = `${helper.scopes.remote}/${envName}`;
      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitWorkspace({
        yarnRCConfig: {
          unsafeHttpWhitelist: ['localhost'],
        },
      });
      helper.scopeHelper.addRemoteScope();
      helper.workspaceJsonc.setPackageManager('teambit.dependencies/yarn');
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.extensions.workspaceJsonc.addKeyValToWorkspace('resolveEnvsFromRoots', true);
      helper.fixtures.populateComponents(1);
      helper.command.setEnv('comp1', envId);
    });
    after(() => {
      npmCiRegistry.destroy();
      helper.scopeHelper.destroy();
    });
    it('should create a versioned root dir for the env and install successfully', () => {
      // without the workspace-ident sanitization in the yarn package-manager, this fails with
      // 'the "file:." reference ... isn't supported by any available fetcher'
      helper.command.install();
      const envRootDir = helper.env.rootCompDir(`${envId}@0.0.1`);
      expect(envRootDir).to.be.a.path();
    });
  }
);
