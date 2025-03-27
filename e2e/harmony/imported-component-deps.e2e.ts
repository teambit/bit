import { resolveFrom } from '@teambit/toolbox.modules.module-resolver';
import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';

(supportNpmCiRegistryTesting ? describe : describe.skip)(
  'installing the right versions of dependencies of a new imported component',
  function () {
    this.timeout(0);
    let scope: string;
    let helper: Helper;
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.workspaceJsonc.setPackageManager(`teambit.dependencies/pnpm`);
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      helper.fixtures.populateComponents(3);
      scope = `@${helper.scopes.remote.replace('.', '/')}.`;
      const code = `const comp3 = require("${scope}comp3");
const isPositive = require('is-positive');
`;
      helper.fs.outputFile(`comp1/index.js`, code);
      helper.fs.outputFile(`comp2/index.js`, code);
      helper.command.install('is-positive@1.0.0');
      helper.command.compile();
      helper.command.tagComponent('comp3 comp1');
      helper.command.export();
      helper.command.removeComponent('comp1');
      helper.command.install('is-positive@2.0.0');
      helper.command.tagComponent('comp3 comp2', undefined, '--unmodified');
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.extensions.workspaceJsonc.setPackageManager(`teambit.dependencies/pnpm`);
      helper.scopeHelper.addRemoteScope();
      helper.workspaceJsonc.setupDefault();
      helper.command.import(`${helper.scopes.remote}/comp1`);
      helper.command.import(`${helper.scopes.remote}/comp2`);
    });
    it('should install component dependencies from their respective models to the imported components', () => {
      const baseDir = path.join(helper.fixtures.scopes.localPath, helper.scopes.remoteWithoutOwner);
      expect(fs.readJsonSync(resolveFrom(path.join(baseDir, 'comp1'), [`${scope}comp3/package.json`])).version).to.eq(
        '0.0.1'
      );
      expect(fs.readJsonSync(resolveFrom(path.join(baseDir, 'comp2'), [`${scope}comp3/package.json`])).version).to.eq(
        '0.0.2'
      );
    });
    it('should install package dependencies from their respective models to the imported components', () => {
      expect(
        fs.readJsonSync(
          resolveFrom(path.join(helper.fixtures.scopes.localPath, helper.scopes.remoteWithoutOwner, 'comp1'), [
            'is-positive/package.json',
          ])
        ).version
      ).to.eq('1.0.0');
      expect(
        fs.readJsonSync(
          resolveFrom(path.join(helper.fixtures.scopes.localPath, helper.scopes.remoteWithoutOwner, 'comp2'), [
            'is-positive/package.json',
          ])
        ).version
      ).to.eq('2.0.0');
    });
    after(() => {
      npmCiRegistry.destroy();
    });
  }
);

(supportNpmCiRegistryTesting ? describe : describe.skip)(
  'importing a component that has peer a peer dependency',
  function () {
    this.timeout(0);
    let helper: Helper;
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.workspaceJsonc.setPackageManager(`teambit.dependencies/pnpm`);
      helper.workspaceJsonc.addKeyValToDependencyResolver('policy', {
        peerDependencies: {
          'is-positive': '1.0.0',
        },
      });
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile(`comp1/index.js`, `const isPositive = require('is-positive');`);
      helper.command.install();
      helper.command.compile();
      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.extensions.workspaceJsonc.setPackageManager(`teambit.dependencies/pnpm`);
      helper.scopeHelper.addRemoteScope();
      helper.workspaceJsonc.setupDefault();
      helper.command.import(`${helper.scopes.remote}/comp1`);
    });
    it('should install component dependencies from their respective models to the imported components', () => {
      const diff = helper.command.diff();
      expect(diff).to.include('there are no modified components to diff');
    });
    after(() => {
      npmCiRegistry.destroy();
    });
  }
);
