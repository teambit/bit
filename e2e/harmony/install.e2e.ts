import path from 'path';
import fs from 'fs-extra';
import { addDistTag } from '@pnpm/registry-mock';
import { IssuesClasses } from '@teambit/component-issues';
import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

describe('install command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('component is in .bitmap and in workspace.jsonc', () => {
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCiInPackageJsonHarmony();
      await npmCiRegistry.init();
      helper.command.tagAllComponents();
      helper.command.export();
      const pkg = helper.general.getPackageNameByCompName('comp1');
      helper.command.install(pkg);
      helper.fs.appendFile('comp1/index.js');
    });
    after(() => {
      npmCiRegistry.destroy();
    });
    it('bit status should show it with DuplicateComponentAndPackage issue', () => {
      helper.command.expectStatusToHaveIssue(IssuesClasses.DuplicateComponentAndPackage.name);
    });
  });
});

(supportNpmCiRegistryTesting ? describe : describe.skip)('install --no-optional', function () {
  this.timeout(0);
  let helper: Helper;
  describe('using pnpm', () => {
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.bitJsonc.setPackageManager(`teambit.dependencies/pnpm`);
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();

      helper.command.setConfig('registry', npmCiRegistry.getRegistryUrl());
      helper.command.install('@pnpm.e2e/pkg-with-good-optional --no-optional');
    });
    after(() => {
      helper.command.delConfig('registry');
      npmCiRegistry.destroy();
      helper.scopeHelper.destroy();
    });
    it('should not install optional dependencies', async () => {
      const dirs = fs.readdirSync(path.join(helper.fixtures.scopes.localPath, 'node_modules/.pnpm'));
      expect(dirs).to.not.include('is-positive@1.0.0');
      expect(dirs).to.include('@pnpm.e2e+pkg-with-good-optional@1.0.0');
    });
  });
});

(supportNpmCiRegistryTesting ? describe : describe.skip)('install --update', function () {
  this.timeout(0);
  let helper: Helper;
  describe('using pnpm', () => {
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.bitJsonc.setPackageManager(`teambit.dependencies/pnpm`);
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();

      helper.command.setConfig('registry', npmCiRegistry.getRegistryUrl());
      await addDistTag({ package: '@pnpm.e2e/pkg-with-1-dep', version: '100.0.0', distTag: 'latest' });
      await addDistTag({ package: '@pnpm.e2e/dep-of-pkg-with-1-dep', version: '100.0.0', distTag: 'latest' });
      helper.command.install('@pnpm.e2e/dep-of-pkg-with-1-dep @pnpm.e2e/parent-of-pkg-with-1-dep');
      await addDistTag({ package: '@pnpm.e2e/pkg-with-1-dep', version: '100.1.0', distTag: 'latest' });
      await addDistTag({ package: '@pnpm.e2e/dep-of-pkg-with-1-dep', version: '101.0.0', distTag: 'latest' });
      helper.command.install('--update');
    });
    after(() => {
      helper.command.delConfig('registry');
      npmCiRegistry.destroy();
      helper.scopeHelper.destroy();
    });
    it('should update direct dependency inside existing range', async () => {
      const manifest = fs.readJSONSync(
        path.join(helper.fixtures.scopes.localPath, 'node_modules/@pnpm.e2e/dep-of-pkg-with-1-dep/package.json')
      );
      expect(manifest.version).to.eq('100.1.0');
    });
    it('should update subdependency inside existing range', async () => {
      const dirs = fs.readdirSync(path.join(helper.fixtures.scopes.localPath, 'node_modules/.pnpm'));
      expect(dirs).to.include('@pnpm.e2e+pkg-with-1-dep@100.1.0');
    });
  });
});
