import { expect } from 'chai';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';

/**
 * Bug reproduction: "component has config changes" false positive during lane-merge.
 *
 * Scenario:
 * 1. A component uses a custom env whose env.jsonc defines a dependency policy (forced runtime/dev deps).
 * 2. The component is snapped on a lane. main diverges (the component gets a new tag on main).
 * 3. A fresh workspace imports the lane. the env is not a workspace component - it's installed as a package.
 * 4. `bit status` / `bit diff` show no modified components. the workspace is clean.
 * 5. BUG: `bit lane merge main` failed with "component has config changes, please snap/tag it first".
 *    the merge flow loaded the component via the legacy loader before its env was loaded into Harmony,
 *    so the env's dependency-policy was not applied. the recalculated component-hash then differed from
 *    the model (packageDependencies/overrides missing the env policy) and the component was mistakenly
 *    marked as config-modified.
 */
(supportNpmCiRegistryTesting ? describe : describe.skip)(
  'lane merge main when the comp env with deps policy is a package and not in the workspace',
  function () {
    this.timeout(0);
    let helper: Helper;
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCiInPackageJsonHarmony();
      await npmCiRegistry.init();

      // create comp1 and an old-style aspect-env that defines a deps policy via getDependencies()
      helper.fs.outputFile('comp1/index.ts', 'export const comp1 = "v1";');
      helper.command.addComponent('comp1');
      const envName = helper.env.setCustomEnv('node-env-dev-dep');
      helper.command.setEnv('comp1', envName);

      // tag with build so the env package is compiled and published to the local registry
      helper.command.tagAllComponents();
      helper.command.export();

      // snap comp1 on a lane
      helper.command.createLane('dev');
      helper.fs.outputFile('comp1/index.ts', 'export const comp1 = "v1-lane";');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      // diverge main: add a file to comp1 on main so the later merge auto-resolves
      helper.command.switchLocalLane('main', '-x');
      helper.fs.outputFile('comp1/main-change.ts', 'export const mainChange = true;');
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      // fresh workspace on the lane. the env is not a workspace component, it gets installed
      // as a package. this is required for reproducing the bug: the env must be loadable so
      // the regular status/diff flow applies its policy, while the merge flow used to miss it.
      helper.scopeHelper.reInitWorkspace();
      npmCiRegistry.setResolver();
      helper.command.importLane('dev');
    });
    after(() => {
      npmCiRegistry.destroy();
      helper.scopeHelper.destroy();
    });
    it('bit status should not show the component as modified before the merge', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponents).to.have.lengthOf(0);
    });
    describe('bit lane merge main', () => {
      let mergeOutput: string;
      before(() => {
        mergeOutput = helper.command.mergeLaneWithoutBuild('main', '-x');
      });
      it('should not fail with a "config changes" false positive', () => {
        expect(mergeOutput).to.not.have.string('config changes');
        expect(mergeOutput).to.have.string('successfully merged');
      });
      it('should snap the diverged component', () => {
        expect(mergeOutput).to.have.string('merge-snapped components');
      });
    });
  }
);
