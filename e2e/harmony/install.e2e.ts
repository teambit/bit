import stripAnsi from 'strip-ansi';
import path from 'path';
import fs from 'fs-extra';
import { addDistTag } from '@pnpm/registry-mock';
import { IssuesClasses } from '@teambit/component-issues';
import { getAnotherInstallRequiredOutput } from '@teambit/install/install.cmd';
import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import { IS_WINDOWS } from '../../src/constants';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));

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

  describe('install with old envs in the workspace', () => {
    let wsEmptyNM: string;
    let envId;
    let envName;
    let output;
    before(async () => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.bitJsonc.setPackageManager('teambit.dependencies/pnpm');
      envName = helper.env.setCustomEnv('env-add-dependencies', { skipCompile: true, skipInstall: true });
      envId = `${helper.scopes.remote}/${envName}`;
      helper.fixtures.populateComponents(1, undefined, undefined, false);
      helper.extensions.addExtensionToVariant('*', envId);
      // Clean the node_modules as we want to run tests when node_modules is empty
      fs.rmdirSync(path.join(helper.scopes.localPath, 'node_modules'), { recursive: true });
      wsEmptyNM = helper.scopeHelper.cloneLocalScope(IS_WINDOWS);
    });
    describe('without --recurring-install', () => {
      before(async () => {
        output = helper.command.install();
      });
      it('should show a warning that the workspace has old env without env.jsonc so another install might be required', async () => {
        const msg = stripAnsi(getAnotherInstallRequiredOutput(false, [envId]));
        expect(output).to.have.string(msg);
      });
      it('should not install deps that were configured in the env in first install', async () => {
        expect(path.join(helper.fixtures.scopes.localPath, 'node_modules/lodash.get')).to.not.be.a.path();
      });
      describe('without --recurring-install - second install', () => {
        before(async () => {
          output = helper.command.install();
        });
        it('should not show a warning that the workspace has old env without env.jsonc so another install might be required', async () => {
          const msg = stripAnsi(getAnotherInstallRequiredOutput(false, [envId]));
          expect(output).to.not.have.string(msg);
        });
        it('should install deps that were configured in the env in second install', async () => {
          expect(path.join(helper.fixtures.scopes.localPath, 'node_modules/lodash.get')).to.be.a.path();
        });
      });
    });
    describe('with --recurring-install', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(wsEmptyNM);
        output = helper.command.install(undefined, { 'recurring-install': '' });
      });
      it('should show a warning that the workspace has old env without env.jsonc but not offer the recurring-install flag', async () => {
        const msg = stripAnsi(getAnotherInstallRequiredOutput(true, [envId]));
        expect(output).to.have.string(msg);
      });
      it('should install deps that were configured in the env', async () => {
        expect(path.join(helper.fixtures.scopes.localPath, 'node_modules/lodash.get')).to.be.a.path();
      });
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

describe('install new dependencies', function () {
  this.timeout(0);
  let helper: Helper;
  let bitJsonc;
  describe('using pnpm', () => {
    before(() => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.extensions.bitJsonc.setPackageManager('teambit.dependencies/pnpm');
      helper.command.install('is-positive@~1.0.0 is-odd@1.0.0 is-even@1 is-negative');
      bitJsonc = helper.bitJsonc.read();
    });
    after(() => {
      helper.scopeHelper.destroy();
    });
    it('should add new dependency preserving the ~ prefix', () => {
      expect(bitJsonc['teambit.dependencies/dependency-resolver'].policy.dependencies['is-positive']).to.equal(
        '~1.0.0'
      );
    });
    it('should add new dependency with ^ prefix if the dependency was installed by specifying the exact version', () => {
      expect(bitJsonc['teambit.dependencies/dependency-resolver'].policy.dependencies['is-odd']).to.equal('^1.0.0');
    });
    it('should add new dependency with ^ prefix if the dependency was installed by specifying a range not using ~', () => {
      expect(bitJsonc['teambit.dependencies/dependency-resolver'].policy.dependencies['is-even']).to.equal('^1.0.0');
    });
    it('should add new dependency with ^ prefix by default', () => {
      expect(bitJsonc['teambit.dependencies/dependency-resolver'].policy.dependencies['is-negative'][0]).to.equal('^');
    });
  });
  describe('using yarn', () => {
    before(() => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.extensions.bitJsonc.setPackageManager('teambit.dependencies/yarn');
      helper.command.install('is-positive@~1.0.0 is-odd@1.0.0 is-even@1 is-negative');
      bitJsonc = helper.bitJsonc.read();
    });
    after(() => {
      helper.scopeHelper.destroy();
    });
    it('should add new dependency preserving the ~ prefix', () => {
      expect(bitJsonc['teambit.dependencies/dependency-resolver'].policy.dependencies['is-positive']).to.equal(
        '~1.0.0'
      );
    });
    it('should add new dependency with ^ prefix if the dependency was installed by specifying the exact version', () => {
      expect(bitJsonc['teambit.dependencies/dependency-resolver'].policy.dependencies['is-odd']).to.equal('^1.0.0');
    });
    it('should add new dependency with ^ prefix if the dependency was installed by specifying a range not using ~', () => {
      expect(bitJsonc['teambit.dependencies/dependency-resolver'].policy.dependencies['is-even']).to.equal('^1.0.0');
    });
    it('should add new dependency with ^ prefix by default', () => {
      expect(bitJsonc['teambit.dependencies/dependency-resolver'].policy.dependencies['is-negative'][0]).to.equal('^');
    });
  });
});

describe('named install', function () {
  this.timeout(0);
  let helper: Helper;
  let bitJsonc;
  before(() => {
    helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
    helper.scopeHelper.setNewLocalAndRemoteScopes();
    helper.extensions.bitJsonc.setPackageManager('teambit.dependencies/pnpm');
    helper.command.install('is-positive@1.0.0');
    helper.command.install('is-positive');
    bitJsonc = helper.bitJsonc.read();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  it('should override already existing dependency with the latest version', () => {
    expect(bitJsonc['teambit.dependencies/dependency-resolver'].policy.dependencies['is-positive']).to.equal('^3.1.0');
  });
});
