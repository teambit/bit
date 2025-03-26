import fs from 'fs';
import { generateRandomStr } from '@teambit/toolbox.string.random';
import { DEPS_GRAPH } from '@teambit/harmony.modules.feature-toggle';
import path from 'path';
import chai, { expect } from 'chai';
import yaml from 'js-yaml';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

(supportNpmCiRegistryTesting ? describe : describe.skip)('dependencies graph data', function () {
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
});

