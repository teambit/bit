import chai, { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

/** The env keys naming PATH, as this platform spells them — `Path` on Windows. */
function pathEnvKeys(): string[] {
  const keys = Object.keys(process.env).filter((key) => key.toUpperCase() === 'PATH');
  return keys.length ? keys : ['PATH'];
}

/**
 * A PATH override holding this process's PATH minus every directory with a
 * `node-gyp` in it, so the installed Bit has to supply its own. Without it the
 * test would pass either way: `npm run` puts the repo's `node_modules/.bin` —
 * which carries a `node-gyp` bin link — on PATH, and dependency build scripts
 * inherit it.
 *
 * Keyed by the casing already in `process.env`, because the command helper
 * spreads it into a plain object: an override under a casing of its own would
 * sit alongside the original rather than replacing it.
 */
function pathWithoutNodeGyp(): Record<string, string> {
  const keys = pathEnvKeys();
  const filtered = (process.env[keys[0]] ?? '')
    .split(path.delimiter)
    .filter((dir) => !['node-gyp', 'node-gyp.cmd'].some((bin) => fs.existsSync(path.join(dir, bin))))
    .join(path.delimiter);
  return Object.fromEntries(keys.map((key) => [key, filtered]));
}

// The pnpm engine ships no node-gyp and spawns dependency build scripts with
// Bit's own PATH, so without the node-gyp Bit puts there, `node-gyp rebuild`
// dies with "node-gyp: command not found".
(supportNpmCiRegistryTesting ? describe : describe.skip)('a dependency built by node-gyp', function () {
  this.timeout(0);
  let helper: Helper;
  let npmCiRegistry: NpmCiRegistry;
  before(async () => {
    helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
    helper.scopeHelper.setWorkspaceWithRemoteScope();
    helper.workspaceJsonc.setPackageManager(`teambit.dependencies/pnpm`);
    npmCiRegistry = new NpmCiRegistry(helper);
    await npmCiRegistry.init();

    npmCiRegistry.setRegistry();
    // A store of its own, so the package is built by this install rather than
    // restored from the side-effects cache of an earlier one — which would
    // reproduce the build output without ever running node-gyp.
    fs.writeFileSync(
      path.join(helper.fixtures.scopes.localPath, 'pnpm-workspace.yaml'),
      `storeDir: ${path.join(helper.fixtures.scopes.localPath, '.pnpm-store')}\n`
    );
    helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('allowScripts', {
      '@pnpm.e2e/has-binding-gyp': true,
    });
    helper.command.install('@pnpm.e2e/has-binding-gyp', undefined, undefined, {
      envVariables: pathWithoutNodeGyp(),
    });
  });
  after(() => {
    npmCiRegistry.destroy();
    helper.scopeHelper.destroy();
  });
  it('should run its install script through node-gyp', () => {
    // Written by the gyp action in the package's binding.gyp, so it only exists
    // if `node-gyp rebuild` was found and ran.
    expect(
      path.join(helper.fixtures.scopes.localPath, 'node_modules/@pnpm.e2e/has-binding-gyp/generated.js')
    ).to.be.a.path();
  });
});
