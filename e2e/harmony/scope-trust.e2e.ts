/**
 * Verifies the workspace's scope-trust gate around aspect loading.
 *
 * Setup: an env in scope A has a top-level statement that writes a marker
 * file when an env-var is set. A consumer component uses that env. A second
 * workspace whose `defaultScope` belongs to a different owner imports the
 * consumer.
 *
 * Expectation: because scope A isn't on the second workspace's effective
 * trust list (builtin + owner-of-defaultScope + configured), the aspect
 * loader doesn't require the env, and the marker file is never written
 * after the import.
 */
import { expect } from 'chai';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';

const MARKER_ENV_VAR = 'BIT_SCOPE_TRUST_TEST_MARKER';

(supportNpmCiRegistryTesting ? describe : describe.skip)(
  'workspace scope-trust gate around aspect loading',
  function () {
    this.timeout(0);
    let helper: Helper;
    let npmCiRegistry: NpmCiRegistry;
    let markerPath: string;
    let originalMarkerEnv: string | undefined;

    before(async () => {
      // Stable absolute marker path; passed to spawned bit processes via the
      // current process's env so the env module's top-level can write it.
      markerPath = path.join(
        os.tmpdir(),
        `bit-scope-trust-marker-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`
      );
      fs.removeSync(markerPath);
      originalMarkerEnv = process.env[MARKER_ENV_VAR];
      process.env[MARKER_ENV_VAR] = markerPath;

      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setWorkspaceWithRemoteScope();

      // Env whose module body writes the marker file when MARKER_ENV_VAR is set.
      helper.env.setEmptyEnv();
      helper.fs.outputFile(
        'empty-env/empty-env.bit-env.ts',
        `
import * as fs from 'fs';
const marker = process.env.${MARKER_ENV_VAR};
if (marker) {
  try { fs.writeFileSync(marker, 'env-module-loaded'); } catch (e) { /* best effort */ }
}
export class EmptyEnv {}
export default new EmptyEnv();
`
      );

      helper.fixtures.populateComponents(1, false);
      helper.command.setEnv('comp1', 'empty-env');

      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      helper.command.install();
      helper.command.compile();
      helper.command.tagAllComponents();
      helper.command.export();

      // Second workspace with a defaultScope under a different owner — without
      // this, the owner-wildcard derived from defaultScope would auto-trust
      // the publisher's scope and the assertion wouldn't reflect a real
      // cross-owner import.
      helper.scopeHelper.reInitWorkspace({ addRemoteScopeAsDefaultScope: false });
      helper.workspaceJsonc.addKeyValToWorkspace('defaultScope', 'other-owner.app');
      npmCiRegistry.setResolver();

      // Clear the marker before the import so any later write is attributable
      // to the consumer-side aspect load (publisher-side install/compile runs
      // its own env code naturally — its scope is trusted in its own workspace).
      fs.removeSync(markerPath);
      expect(fs.existsSync(markerPath), 'marker should be absent before import').to.be.false;

      try {
        helper.command.importComponent('comp1');
      } catch {
        // Aspect load refused → import command may exit non-zero. The
        // marker-file check below is the source of truth.
      }
    });

    after(() => {
      try {
        fs.removeSync(markerPath);
      } catch {}
      if (originalMarkerEnv === undefined) delete process.env[MARKER_ENV_VAR];
      else process.env[MARKER_ENV_VAR] = originalMarkerEnv;
      npmCiRegistry?.destroy();
      helper?.scopeHelper.destroy();
    });

    it('does not load the env from a scope outside the trust list', () => {
      expect(fs.existsSync(markerPath), `env module loaded; marker at ${markerPath}`).to.be.false;
    });
  }
);
