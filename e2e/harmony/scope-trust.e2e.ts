/**
 * Verifies the workspace's scope-trust gate around aspect loading.
 *
 * The gate is opt-in: it only runs when `trustedScopes` is present in
 * workspace.jsonc. The deny test below opts in explicitly; the allow test
 * lists the env's scope.
 *
 * Setup: an env in scope A has a top-level statement that writes a marker
 * file when an env-var is set. A consumer component uses that env. A second
 * workspace whose `defaultScope` belongs to a different owner imports the
 * consumer.
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

      // Second workspace, opted in to scope-trust with an empty list. The
      // defaultScope is under a different owner so the owner-wildcard doesn't
      // auto-trust the publisher's scope; the empty list means only builtins
      // are trusted, so the publisher's scope is rejected.
      helper.scopeHelper.reInitWorkspace({ addRemoteScopeAsDefaultScope: false });
      helper.workspaceJsonc.addKeyValToWorkspace('defaultScope', 'other-owner.app');
      helper.workspaceJsonc.addKeyValToWorkspace('trustedScopes', []);
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

(supportNpmCiRegistryTesting ? describe : describe.skip)(
  'workspace scope-trust gate: trusted env in a different scope than the consumer',
  function () {
    this.timeout(0);
    let helper: Helper;
    let npmCiRegistry: NpmCiRegistry;
    let markerPath: string;
    let originalMarkerEnv: string | undefined;
    let envScopeName: string;
    let importOutput: string;

    before(async () => {
      markerPath = path.join(
        os.tmpdir(),
        `bit-scope-trust-marker-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`
      );
      fs.removeSync(markerPath);
      originalMarkerEnv = process.env[MARKER_ENV_VAR];
      process.env[MARKER_ENV_VAR] = markerPath;

      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      // The publisher's default remote will hold the env. envScopeName is the
      // exact scope name the victim will trust explicitly via `bit scope trust`.
      envScopeName = helper.scopes.remote;

      // A second remote holds the consumer component. The victim does NOT
      // trust this scope. The import should still succeed because only the
      // env's scope is checked at aspect-load.
      const compRemote = helper.scopeHelper.getNewBareScope('-comp-remote');
      // Register compRemote in the publisher workspace and cross-link the two
      // remotes so each can resolve dependencies from the other.
      helper.scopeHelper.addRemoteScope(compRemote.scopePath);
      helper.scopeHelper.addRemoteScope(compRemote.scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, compRemote.scopePath);

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
      // Retarget the consumer (comp1) to the second remote scope so its scope
      // differs from the env's scope.
      helper.command.setScope(compRemote.scopeName, 'comp1');

      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      helper.command.install();
      helper.command.compile();
      helper.command.tagAllComponents();
      helper.command.export();

      // Victim workspace under a different owner (so neither scope is auto-
      // trusted via the owner-of-defaultScope wildcard). Trust ONLY the env's
      // scope explicitly. The consumer's scope remains untrusted.
      helper.scopeHelper.reInitWorkspace({ addRemoteScopeAsDefaultScope: false });
      helper.workspaceJsonc.addKeyValToWorkspace('defaultScope', 'other-owner.app');
      helper.workspaceJsonc.addKeyValToWorkspace('trustedScopes', [envScopeName]);
      helper.scopeHelper.addRemoteScope(compRemote.scopePath);
      npmCiRegistry.setResolver({ [compRemote.scopeName]: compRemote.scopePath });

      fs.removeSync(markerPath);
      expect(fs.existsSync(markerPath), 'marker should be absent before import').to.be.false;

      importOutput = helper.command.import(`${compRemote.scopeName}/comp1`);
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

    it('imports successfully (no error about untrusted scopes)', () => {
      expect(importOutput).to.match(/successfully imported/i);
      expect(importOutput).to.not.match(/isn't on the workspace's trusted list/i);
    });

    it('loads the env from the trusted scope', () => {
      expect(fs.existsSync(markerPath), `env module did not load; expected marker at ${markerPath}`).to.be.true;
    });
  }
);
