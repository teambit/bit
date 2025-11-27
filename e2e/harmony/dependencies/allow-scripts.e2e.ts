import chai, { expect } from 'chai';
import path from 'path';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

(supportNpmCiRegistryTesting ? describe : describe.skip)('allowing scripts to run in dependencies', function () {
  this.timeout(0);
  let helper: Helper;
  describe('using pnpm', () => {
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.workspaceJsonc.setPackageManager(`teambit.dependencies/pnpm`);
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();

      helper.command.setConfig('registry', npmCiRegistry.getRegistryUrl());
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('allowScripts', {
        '@pnpm.e2e/failing-postinstall': false,
        '@pnpm.e2e/pre-and-postinstall-scripts-example': true,
      });
      helper.command.install('@pnpm.e2e/failing-postinstall @pnpm.e2e/pre-and-postinstall-scripts-example');
    });
    after(() => {
      helper.command.delConfig('registry');
      npmCiRegistry.destroy();
      helper.scopeHelper.destroy();
    });
    it('should build the dependency that is allowed to run scripts', async () => {
      expect(
        path.join(
          helper.fixtures.scopes.localPath,
          'node_modules/@pnpm.e2e/pre-and-postinstall-scripts-example/package.json'
        )
      ).to.be.a.path();
      expect(
        path.join(
          helper.fixtures.scopes.localPath,
          'node_modules/@pnpm.e2e/pre-and-postinstall-scripts-example/generated-by-preinstall.js'
        )
      ).to.be.a.path();
    });
  });
});
