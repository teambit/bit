import fs from 'fs';
import { generateRandomStr } from '@teambit/toolbox.string.random';
import { DEPS_GRAPH } from '@teambit/harmony.modules.feature-toggle';
import { addDistTag } from '@pnpm/registry-mock';
import path from 'path';
import chai, { expect } from 'chai';
import chaiFs from 'chai-fs';
import yaml from 'js-yaml';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';

chai.use(chaiFs);

(supportNpmCiRegistryTesting ? describe : describe.skip)('dependencies graph data (re-import scenarios)', function () {
  this.timeout(0);
  let npmCiRegistry: NpmCiRegistry;
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(DEPS_GRAPH);
  });
  after(() => {
    helper.scopeHelper.destroy();
    helper.command.resetFeatures();
  });
  // Same class of drift as the previous block, but for the "pull updated version of an
  // already-imported component" path. Only the re-imported component's IDs are passed to
  // installPackagesGracefully, so only its graph is used to regenerate the lockfile — the
  // merge helper has to preserve unrelated components' previously-locked deps.
  describe('re-importing an updated version of an already-imported component', function () {
    let randomStr: string;
    let lockfileAfterReimport: any;
    before(async () => {
      randomStr = generateRandomStr(4);
      const name = `@ci/${randomStr}.{name}`;
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);
      await npmCiRegistry.init();
      helper.command.setConfig('registry', npmCiRegistry.getRegistryUrl());
      helper.env.setCustomNewEnv(
        undefined,
        undefined,
        { policy: { peers: [] } },
        false,
        'custom-env/env',
        'custom-env/env'
      );
      helper.fs.createFile('comp1', 'comp1.js', 'require("@pnpm.e2e/foo"); // eslint-disable-line');
      helper.command.addComponent('comp1');
      helper.extensions.addExtensionToVariant('comp1', `${helper.scopes.remote}/custom-env/env`, {});
      helper.fs.createFile('comp2', 'comp2.js', 'require("@pnpm.e2e/bar"); // eslint-disable-line');
      helper.command.addComponent('comp2');
      helper.extensions.addExtensionToVariant('comp2', `${helper.scopes.remote}/custom-env/env`, {});
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
      await addDistTag({ package: '@pnpm.e2e/foo', version: '100.0.0', distTag: 'latest' });
      await addDistTag({ package: '@pnpm.e2e/bar', version: '100.0.0', distTag: 'latest' });
      helper.command.install('--add-missing-deps');
      helper.command.tagAllComponents('--skip-tests');
      helper.command.export();

      helper.fs.appendFile('comp1/comp1.js', '\nmodule.exports = 1;');
      helper.command.tagAllComponents('--skip-tests --unmodified');
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.command.import(`${helper.scopes.remote}/comp1@0.0.1 ${helper.scopes.remote}/comp2@latest`);

      await addDistTag({ package: '@pnpm.e2e/bar', version: '100.1.0', distTag: 'latest' });

      helper.command.import(`${helper.scopes.remote}/comp1@latest`);
      lockfileAfterReimport = yaml.load(fs.readFileSync(path.join(helper.scopes.localPath, 'pnpm-lock.yaml'), 'utf8'));
    });
    after(() => {
      npmCiRegistry.destroy();
      helper.command.delConfig('registry');
      helper.scopeHelper.destroy();
    });
    // Regression coverage: re-importing comp1 must not regenerate the lockfile from
    // comp1's graph only and drop comp2's bar entry. Otherwise pnpm may re-resolve bar
    // from the manifest specifier and drift to the newer registry version.
    it('should preserve comp2 dependency versions that are unrelated to the re-imported component', () => {
      expect(lockfileAfterReimport.packages).to.have.property('@pnpm.e2e/bar@100.0.0');
      expect(lockfileAfterReimport.packages).to.not.have.property('@pnpm.e2e/bar@100.1.0');
    });
  });
  describe('three components sharing a peer dependency', function () {
    let randomStr: string;
    let lockfile: any;
    before(async () => {
      randomStr = generateRandomStr(4);
      const name = `@ci/${randomStr}.{name}`;
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);
      await npmCiRegistry.init();
      helper.command.setConfig('registry', npmCiRegistry.getRegistryUrl());
      helper.env.setCustomNewEnv(
        undefined,
        undefined,
        {
          policy: {
            peers: [
              {
                name: '@pnpm.e2e/abc',
                version: '*',
                supportedRange: '*',
              },
            ],
          },
        },
        false,
        'custom-env/env',
        'custom-env/env'
      );
      helper.fs.createFile('bar', 'bar.js', 'require("@pnpm.e2e/abc"); // eslint-disable-line');
      helper.command.addComponent('bar');
      helper.extensions.addExtensionToVariant('bar', `${helper.scopes.remote}/custom-env/env`, {});
      await addDistTag({ package: '@pnpm.e2e/abc', version: '1.0.0', distTag: 'latest' });
      await addDistTag({ package: '@pnpm.e2e/peer-a', version: '1.0.0', distTag: 'latest' });
      helper.command.install('--add-missing-deps');
      helper.command.tagAllComponents('--skip-tests');
      helper.command.export();

      await addDistTag({ package: '@pnpm.e2e/abc', version: '2.0.0', distTag: 'latest' });
      await addDistTag({ package: '@pnpm.e2e/peer-a', version: '1.0.1', distTag: 'latest' });
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.fs.createFile('foo', 'foo.js', `require("@pnpm.e2e/abc"); require("@ci/${randomStr}.bar");`);
      helper.command.addComponent('foo');
      helper.extensions.addExtensionToVariant('foo', `${helper.scopes.remote}/custom-env/env@0.0.1`, {});
      helper.command.install('--add-missing-deps');
      helper.command.snapAllComponentsWithoutBuild('--skip-tests');
      helper.command.export();

      // A third component re-uses one of the already-published versions (peer-a@1.0.0)
      // so the merge has to reconcile three graphs where two of them agree on the lower
      // version and one carries the higher version.
      await addDistTag({ package: '@pnpm.e2e/abc', version: '1.0.0', distTag: 'latest' });
      await addDistTag({ package: '@pnpm.e2e/peer-a', version: '1.0.0', distTag: 'latest' });
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.fs.createFile('baz', 'baz.js', `require("@pnpm.e2e/abc"); require("@ci/${randomStr}.bar");`);
      helper.command.addComponent('baz');
      helper.extensions.addExtensionToVariant('baz', `${helper.scopes.remote}/custom-env/env@0.0.1`, {});
      helper.command.install('--add-missing-deps');
      helper.command.snapAllComponentsWithoutBuild('--skip-tests');
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.import(
        `${helper.scopes.remote}/foo@latest ${helper.scopes.remote}/bar@latest ${helper.scopes.remote}/baz@latest`
      );
      lockfile = yaml.load(fs.readFileSync(path.join(helper.scopes.localPath, 'pnpm-lock.yaml'), 'utf8'));
    });
    after(() => {
      npmCiRegistry.destroy();
      helper.command.delConfig('registry');
      helper.scopeHelper.destroy();
    });
    it('should restore the lockfile from the merged graphs', () => {
      expect(lockfile.bit.restoredFromModel).to.eq(true);
    });
    // The root edge of the merged graph picks the highest peer version per (name, specifier),
    // so the highest variant must be present in the lockfile.
    it('should include the highest version of the shared peer dependency across all three graphs', () => {
      expect(lockfile.packages).to.have.property('@pnpm.e2e/abc@2.0.0');
      expect(lockfile.packages).to.have.property('@pnpm.e2e/peer-a@1.0.1');
    });
    // Documents a known limitation of the merge: highest-wins is applied only to the root
    // edge. Transitive snapshots from lower-version graphs still reference the older
    // versions of non-peer packages, so pnpm retains them in the lockfile. (Peer versions
    // get reconciled across the workspace at install time, so they don't leak; regular
    // dependencies do.)
    it('currently leaves the lower version of non-peer transitives in the lockfile', () => {
      expect(lockfile.packages).to.have.property('@pnpm.e2e/abc@1.0.0');
    });
  });
});
