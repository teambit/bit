import fs from 'fs';
import { generateRandomStr } from '@teambit/toolbox.string.random';
import { DEPS_GRAPH, COMPS_UPDATE } from '@teambit/harmony.modules.feature-toggle';
import path from 'path';
import chai, { expect } from 'chai';
import yaml from 'js-yaml';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

(supportNpmCiRegistryTesting ? describe : describe.skip)('updating components', function () {
  this.timeout(0);
  let npmCiRegistry: NpmCiRegistry;
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures([DEPS_GRAPH, COMPS_UPDATE]);
  });
  after(() => {
    helper.scopeHelper.destroy();
    helper.command.resetFeatures();
  });
  describe('two components are imported one of which depends on the other', function () {
    let randomStr: string;
    before(async () => {
      randomStr = generateRandomStr(4); // to avoid publishing the same package every time the test is running
      const name = `@ci/${randomStr}.{name}`;
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);
      await npmCiRegistry.init();
      helper.command.setConfig('registry', npmCiRegistry.getRegistryUrl());

      helper.fixtures.populateComponents(4);
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.command.install('--add-missing-deps');
      helper.command.tagAllComponents('--skip-tests');
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.import(`${helper.scopes.remote}/comp1 ${helper.scopes.remote}/comp4`);
    });
    after(() => {
      npmCiRegistry.destroy();
      helper.command.delConfig('registry');
      helper.scopeHelper.destroy();
    });
    it('should link component from the workspace', () => {
      const lockfile = yaml.load(fs.readFileSync(path.join(helper.scopes.localPath, 'pnpm-lock.yaml'), 'utf8'));
      expect(lockfile.overrides).to.eql({
        [`@ci/${randomStr}.comp1`]: 'workspace:*',
        [`@ci/${randomStr}.comp2`]: 'latest',
        [`@ci/${randomStr}.comp3`]: 'latest',
        [`@ci/${randomStr}.comp4`]: 'workspace:*'
      })
    });
  });
  describe('a component is imported to the workspace that has the component in dependencies', function () {
    let randomStr: string;
    before(async () => {
      randomStr = generateRandomStr(4); // to avoid publishing the same package every time the test is running
      const name = `@ci/${randomStr}.{name}`;
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);
      await npmCiRegistry.init();
      helper.command.setConfig('registry', npmCiRegistry.getRegistryUrl());

      helper.fixtures.populateComponents(4);
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.command.install('--add-missing-deps');
      helper.command.tagAllComponents('--skip-tests');
      helper.command.export();

      helper.command.removeComponent('comp1')
      helper.command.tagAllComponents('--skip-tests --unmodified');
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.import(`${helper.scopes.remote}/comp1`);
      helper.command.import(`${helper.scopes.remote}/comp4`);
    });
    after(() => {
      npmCiRegistry.destroy();
      helper.command.delConfig('registry');
      helper.scopeHelper.destroy();
    });
    it('should link component from the workspace', () => {
      const lockfile = yaml.load(fs.readFileSync(path.join(helper.scopes.localPath, 'pnpm-lock.yaml'), 'utf8'));
      expect(lockfile.overrides).to.eql({
        [`@ci/${randomStr}.comp1`]: 'workspace:*',
        [`@ci/${randomStr}.comp2`]: 'latest',
        [`@ci/${randomStr}.comp3`]: 'latest',
        [`@ci/${randomStr}.comp4`]: 'workspace:*'
      })
    });
  });
  describe('a new dependency is installed that has a component from the workspace in dependencies', function () {
    let randomStr: string;
    before(async () => {
      randomStr = generateRandomStr(4); // to avoid publishing the same package every time the test is running
      const name = `@ci/${randomStr}.{name}`;
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);
      await npmCiRegistry.init();
      helper.command.setConfig('registry', npmCiRegistry.getRegistryUrl());

      helper.fixtures.populateComponents(3);
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.command.install('--add-missing-deps');
      helper.command.tagAllComponents('--skip-tests');
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.import(`${helper.scopes.remote}/comp3`);
      helper.fixtures.createComponentBarFoo(`const comp1 = require("@ci/${randomStr}.comp1")`);
      helper.fixtures.addComponentBarFoo();
      helper.command.install('--add-missing-deps');
    });
    after(() => {
      npmCiRegistry.destroy();
      helper.command.delConfig('registry');
      helper.scopeHelper.destroy();
    });
    it('should link component from the workspace', () => {
      const lockfile = yaml.load(fs.readFileSync(path.join(helper.scopes.localPath, 'pnpm-lock.yaml'), 'utf8'));
      expect(lockfile.overrides).to.eql({
        [`@ci/${randomStr}.comp1`]: 'latest',
        [`@ci/${randomStr}.comp2`]: 'latest',
        [`@ci/${randomStr}.comp3`]: 'workspace:*',
        [`@${helper.scopes.remote}/bar.foo`]: 'workspace:*',
      })
    });
  });
});

