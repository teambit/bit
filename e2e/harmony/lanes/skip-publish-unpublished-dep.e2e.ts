/* eslint-disable @typescript-eslint/no-unused-expressions */
import chai, { expect } from 'chai';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';

chai.use(chaiFs);

/**
 * Reproduces the `bit ci pr` (reuse-lane) failure where an unmodified dependency was BUILT but never
 * PUBLISHED — e.g. a previous run snapped with the publish task skipped (`--skip-tasks`). The build
 * succeeds, so the version's `buildStatus` is 'succeed', but no package reaches the registry.
 *
 * On a later run only the modified component is snapped+built. The capsule-creation optimization
 * (`filterUnmodifiedExportedDependencies`) used to exclude such an unmodified exported dependency from
 * the capsules and install it as a package from the registry — relying on `buildStatus === 'succeed'`
 * as a proxy for "published". With publish skipped that proxy is wrong, so the install died with the
 * cryptic `No matching version found for @scope/comp@0.0.0-<hash>`.
 *
 * The fix gates the exclusion on the version actually having been published (`publishedPackage` builder
 * metadata, a local check), so an unpublished-but-built dependency is kept in the capsule set and built
 * from source instead of fetched from the registry.
 *
 * Uses the npm CI registry so the unpublished snap genuinely 404s (with a local file remote the dep is
 * filtered out of the install manifest and never fetched, so it can't reproduce).
 */
(supportNpmCiRegistryTesting ? describe : describe.skip)(
  'snap+build a dependent of an unmodified, built-but-unpublished dependency',
  function () {
    this.timeout(0);
    let helper: Helper;
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      helper.fixtures.populateComponents(2); // comp1 -> comp2
      helper.command.createLane();
      npmCiRegistry.setResolver();
      // snap+build both, but SKIP the publish task. comp2 ends up with buildStatus 'succeed' yet no
      // package on the registry — the state a `bit ci pr` run that skipped publish leaves on the lane.
      helper.command.snapAllComponents('--skip-tasks PublishComponents');
      helper.command.export();
    });
    after(() => {
      npmCiRegistry.destroy();
      helper.scopeHelper.destroy();
      helper = new Helper();
    });

    // re-snapping only comp1 makes comp2 an unmodified, non-seeder dependency. before the fix its
    // buildStatus 'succeed' got it excluded from the capsules and installed from the registry → 404.
    // snapComponent throws if `bit snap` exits non-zero, so a successful return is itself the assertion
    // that the capsule build did NOT fail fetching the unpublished dependency. we deliberately do NOT
    // swallow the error — a failure must fail the test rather than silently pass.
    it('builds the unpublished dependency from source instead of failing to install it', () => {
      const output = helper.command.snapComponent('comp1', 'snap-message', '--unmodified');
      expect(output, 'comp1 should have been snapped').to.have.string('component(s) snapped');
    });
  }
);
