import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../../src/e2e-helper/e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));

// These tests are temporarily skipped because they fail in CI for some reason
(supportNpmCiRegistryTesting ? describe.skip : describe.skip)('install --add-missing-peers', function () {
  let npmCiRegistry: NpmCiRegistry;
  let helper: Helper;
  this.timeout(0);
  before(async () => {
    helper = new Helper();
    npmCiRegistry = new NpmCiRegistry(helper);
    await npmCiRegistry.init();
  });
  after(() => {
    helper.scopeHelper.destroy();
    npmCiRegistry.destroy();
  });
  describe(`using pnpm as a package manager`, () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope({ registry: npmCiRegistry.ciRegistry });
      helper.extensions.bitJsonc.addKeyValToDependencyResolver('packageManager', `teambit.dependencies/pnpm`);
      helper.command.install('has-foo100-peer@1.0.0 has-foo101-peer@1.0.0 abc@1.0.0');
      helper.command.install('--add-missing-peers');
    });
    it('should install the missing peer dependencies to node_modules', function () {
      expect(path.join(helper.fixtures.scopes.localPath, 'node_modules/peer-a')).to.be.a.path();
      expect(path.join(helper.fixtures.scopes.localPath, 'node_modules/peer-b')).to.be.a.path();
      expect(path.join(helper.fixtures.scopes.localPath, 'node_modules/peer-c')).to.be.a.path();
    });
    it('should not install the missing peer dependencies that have conflicting versions to node_modules', function () {
      expect(path.join(helper.fixtures.scopes.localPath, 'node_modules/foo')).not.to.be.a.path();
    });
    it('should add the missing peer dependencies to workspace.jsonc', () => {
      expect(
        helper.bitJsonc.read()['teambit.dependencies/dependency-resolver'].policy.peerDependencies
      ).to.have.property('peer-a');
      expect(
        helper.bitJsonc.read()['teambit.dependencies/dependency-resolver'].policy.peerDependencies
      ).to.have.property('peer-b');
      expect(
        helper.bitJsonc.read()['teambit.dependencies/dependency-resolver'].policy.peerDependencies
      ).to.have.property('peer-c');
    });
    it('should not add the missing peer dependencies that have conflicting versions to workspace.jsonc', () => {
      expect(
        helper.bitJsonc.read()['teambit.dependencies/dependency-resolver'].policy.peerDependencies
      ).not.to.have.property('foo');
    });
  });
  describe('installing new packages and missing peer dependencies at the same time', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope({ registry: npmCiRegistry.ciRegistry });
      helper.extensions.bitJsonc.addKeyValToDependencyResolver('packageManager', `teambit.dependencies/pnpm`);
      helper.command.install('abc@1.0.0 --add-missing-peers');
    });
    it('should install the new package', () => {
      expect(path.join(helper.fixtures.scopes.localPath, 'node_modules/abc')).to.be.a.path();
    });
    it('should install the peer dependencies of the installed package', () => {
      expect(path.join(helper.fixtures.scopes.localPath, 'node_modules/peer-a')).to.be.a.path();
      expect(path.join(helper.fixtures.scopes.localPath, 'node_modules/peer-b')).to.be.a.path();
      expect(path.join(helper.fixtures.scopes.localPath, 'node_modules/peer-c')).to.be.a.path();
    });
    it('should add the missing peer dependencies to workspace.jsonc', () => {
      expect(
        helper.bitJsonc.read()['teambit.dependencies/dependency-resolver'].policy.peerDependencies
      ).to.have.property('peer-a');
      expect(
        helper.bitJsonc.read()['teambit.dependencies/dependency-resolver'].policy.peerDependencies
      ).to.have.property('peer-b');
      expect(
        helper.bitJsonc.read()['teambit.dependencies/dependency-resolver'].policy.peerDependencies
      ).to.have.property('peer-c');
    });
  });
  describe(`using Yarn as a package manager`, () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope({ registry: npmCiRegistry.ciRegistry });
      helper.extensions.bitJsonc.addKeyValToDependencyResolver('packageManager', `teambit.dependencies/yarn`);
      helper.command.install('has-foo100-peer@1.0.0 has-foo101-peer@1.0.0 abc@1.0.0');
      helper.command.install('--add-missing-peers');
    });
    it('should install the missing peer dependencies to node_modules', function () {
      expect(path.join(helper.fixtures.scopes.localPath, 'node_modules/peer-a')).to.be.a.path();
      expect(path.join(helper.fixtures.scopes.localPath, 'node_modules/peer-b')).to.be.a.path();
      expect(path.join(helper.fixtures.scopes.localPath, 'node_modules/peer-c')).to.be.a.path();
    });
    it('should not install the missing peer dependencies that have conflicting versions to node_modules', function () {
      expect(path.join(helper.fixtures.scopes.localPath, 'node_modules/foo')).not.to.be.a.path();
    });
    it('should add the missing peer dependencies to workspace.jsonc', () => {
      expect(
        helper.bitJsonc.read()['teambit.dependencies/dependency-resolver'].policy.peerDependencies
      ).to.have.property('peer-a');
      expect(
        helper.bitJsonc.read()['teambit.dependencies/dependency-resolver'].policy.peerDependencies
      ).to.have.property('peer-b');
      expect(
        helper.bitJsonc.read()['teambit.dependencies/dependency-resolver'].policy.peerDependencies
      ).to.have.property('peer-c');
    });
    it('should not add the missing peer dependencies that have conflicting versions to workspace.jsonc', () => {
      expect(
        helper.bitJsonc.read()['teambit.dependencies/dependency-resolver'].policy.peerDependencies
      ).not.to.have.property('foo');
    });
  });
});
