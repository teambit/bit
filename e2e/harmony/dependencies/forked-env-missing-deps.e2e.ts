import { IssuesClasses } from '@teambit/component-issues';
import { Helper } from '@teambit/legacy.e2e-helper';

/**
 * Regression test for PR #10150.
 *
 * When `bit new` (or `bit fork`) creates a workspace with a forked env, the
 * forking process copies the dep-resolver aspect config verbatim from the
 * source version. If that config contains entries with the "+" sentinel
 * (MANUALLY_ADD_DEPENDENCY — meaning "resolve version from the workspace
 * package.json"), a chicken-and-egg problem arises on a fresh workspace:
 *
 *   1. _manuallyAddPackage() tries to resolve "+" from the workspace
 *      root package.json, but the package is not yet installed → null →
 *      pushed to missingPackageDependencies (not to packageDependencies).
 *   2. The package is therefore absent from depManifestBeforeFiltering.
 *   3. The usedPeerDependencies filter (introduced by PR #10150) checks
 *      depManifestBeforeFiltering and excludes the package.
 *   4. pnpm never installs it.
 *   5. Every subsequent `bit status` / `bit install` repeats the cycle.
 *
 * Before PR #10150, `defaultPeerDependencies` was spread unconditionally,
 * which broke the cycle on the first install.
 */
describe('forked env with "+" dependency markers (PR #10150 regression)', function () {
  this.timeout(0);
  let helper: Helper;

  before(() => {
    helper = new Helper();
  });

  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('fork an env whose dep-resolver config has "+" entries for env peer packages', () => {
    const envName = 'react-based-env';

    before(() => {
      // ── Source workspace: create the env, tag, and export ──────────────
      helper.scopeHelper.setWorkspaceWithRemoteScope();

      // Create a custom env with env.jsonc that declares is-positive as a
      // peer dependency.  For the env component *itself*, this peer entry
      // becomes part of the selfPolicy (via getPoliciesFromEnvForItself),
      // which feeds into _getDefaultPeerDependencies().
      const envPolicy = {
        peers: [{ name: 'is-positive', version: '3.1.0', supportedRange: '^3.0.0' }],
      };
      helper.env.setCustomNewEnv(undefined, undefined, { policy: envPolicy }, true);

      // Make sure is-positive is present in the workspace so the "+" marker
      // can be resolved during tagging in this (source) workspace.
      helper.command.install('is-positive@3.1.0');

      // Simulate the original env having an explicit "+" dep-resolver entry
      // for is-positive.  This is the config that gets copied verbatim when
      // the component is forked.
      const bitmap = helper.bitMap.read();
      bitmap[envName] = bitmap[envName] || {};
      bitmap[envName].config = {
        ...bitmap[envName].config,
        'teambit.dependencies/dependency-resolver': {
          policy: {
            dependencies: {
              'is-positive': '+',
            },
          },
        },
      };
      helper.bitMap.write(bitmap);

      helper.command.tagAllWithoutBuild();
      helper.command.export();

      // ── Fresh workspace: fork the env ─────────────────────────────────
      helper.scopeHelper.reInitWorkspace({
        // Enable the MissingManuallyConfiguredPackages issue so the test
        // can detect it (the default e2e helper suppresses it).
        disableMissingManuallyConfiguredPackagesIssue: false,
      });
      helper.scopeHelper.addRemoteScope();

      // Fork the env from the remote scope.  The forking process copies the
      // dep-resolver config (including the "+" entry for is-positive) from
      // the tagged version into the new component's .bitmap.
      helper.command.fork(`${helper.scopes.remote}/${envName} my-forked-env`);
    });

    it('bit status should not have MissingManuallyConfiguredPackages issue for the forked env', () => {
      helper.command.expectStatusToNotHaveIssue(IssuesClasses.MissingManuallyConfiguredPackages.name);
    });

    it('bit status should not have any component issues', () => {
      helper.command.expectStatusToNotHaveIssues();
    });
  });
});
