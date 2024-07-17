import chai, { expect } from 'chai';
import path from 'path';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../../npm-ci-registry';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

(supportNpmCiRegistryTesting ? describe : describe.skip)('never built dependencies', function () {
  this.timeout(0);
  let helper: Helper;
  describe('using pnpm', () => {
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.workspaceJsonc.setPackageManager(`teambit.dependencies/pnpm`);
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();

      helper.command.setConfig('registry', npmCiRegistry.getRegistryUrl());
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('neverBuiltDependencies', [
        '@pnpm.e2e/pre-and-postinstall-scripts-example',
      ]);
      helper.command.install('@pnpm.e2e/pre-and-postinstall-scripts-example');
    });
    after(() => {
      helper.command.delConfig('registry');
      npmCiRegistry.destroy();
      helper.scopeHelper.destroy();
    });
    it('should not build the dependency', async () => {
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
      ).not.to.be.a.path();
    });
  });
  describe('using yarn', () => {
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopes({
        yarnRCConfig: {
          unsafeHttpWhitelist: ['localhost'],
        },
      });
      helper.workspaceJsonc.setPackageManager(`teambit.dependencies/yarn`);
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();

      helper.command.setConfig('registry', npmCiRegistry.getRegistryUrl());
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('neverBuiltDependencies', [
        '@pnpm.e2e/pre-and-postinstall-scripts-example',
      ]);
      helper.command.install('@pnpm.e2e/pre-and-postinstall-scripts-example');
    });
    after(() => {
      helper.command.delConfig('registry');
      npmCiRegistry.destroy();
      helper.scopeHelper.destroy();
    });
    it('should not build the dependency', async () => {
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
      ).not.to.be.a.path();
    });
  });
});
