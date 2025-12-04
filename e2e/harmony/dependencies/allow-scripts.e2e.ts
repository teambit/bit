import chai, { expect } from 'chai';
import path from 'path';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

(supportNpmCiRegistryTesting ? describe : describe.skip)('allowing scripts to run in dependencies', function () {
  this.timeout(0);
  let helper: Helper;
  describe('setting allow scripts via workspace.jsonc', () => {
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
      // The installation below would fail if we didn't explicitly disallow
      // @pnpm.e2e/failing-postinstall in allowScripts.
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
  describe('setting allow scripts via flags', () => {
    let npmCiRegistry: NpmCiRegistry;
    let workspaceJsonc;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.workspaceJsonc.setPackageManager(`teambit.dependencies/pnpm`);
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();

      helper.command.setConfig('registry', npmCiRegistry.getRegistryUrl());
      // The installation below would fail if we didn't explicitly disallow
      // @pnpm.e2e/failing-postinstall in allowScripts.
      helper.command.install('@pnpm.e2e/failing-postinstall @pnpm.e2e/pre-and-postinstall-scripts-example --disallow-scripts=@pnpm.e2e/failing-postinstall --allow-scripts=@pnpm.e2e/pre-and-postinstall-scripts-example');
      workspaceJsonc = helper.workspaceJsonc.read();
    });
    after(() => {
      helper.command.delConfig('registry');
      npmCiRegistry.destroy();
      helper.scopeHelper.destroy();
    });
    it('should have updated the allowScripts setting in workspace.jsonc', () => {
      expect(workspaceJsonc['teambit.dependencies/dependency-resolver'].allowScripts).to.deep.equal({
        '@pnpm.e2e/failing-postinstall': false,
        '@pnpm.e2e/pre-and-postinstall-scripts-example': true,
      });
    });
    it('should build the dependency that is allowed to run scripts', () => {
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
