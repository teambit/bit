import chai, { expect } from 'chai';
import path from 'path';
import { Extensions } from '@teambit/legacy.constants';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
import assertArrays from 'chai-arrays';
chai.use(chaiFs);

chai.use(assertArrays);
describe('dependency-resolver extension (part 2)', function () {
  let helper: Helper;
  this.timeout(0);
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('env.jsonc with policy.peer version="*"', () => {
    let npmCiRegistry: NpmCiRegistry;
    const examplePkg = '@ci/lodash';
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      npmCiRegistry.publishPackage(examplePkg, '0.0.1');

      helper.env.setEmptyEnv();
      helper.fs.outputFile(
        'empty-env/env.jsonc',
        `{
  "policy": {
    "peers": [
      {
        "name": "${examplePkg}",
        "version": "*",
        "supportedRange": "*"
      }
    ]
  }
}
`
      );
      helper.command.tagAllComponents();
      helper.command.export();
    });
    after(() => {
      npmCiRegistry.destroy();
    });
    function validatePkgData() {
      const comp = helper.command.catComponent(`${helper.scopes.remote}/empty-env@latest`);
      const depResolverExt = comp.extensions.find((e) => e.name === Extensions.dependencyResolver);
      const policy = depResolverExt.data.policy.find((p) => p.dependencyId === examplePkg);
      expect(policy.value.version).to.equal('*');
      const data = depResolverExt.data.dependencies.find((p) => p.id === examplePkg);
      expect(data.version).to.equal('*');
    }
    it('should not break and save the policy correctly with the *', () => {
      validatePkgData();
    });
    describe('publishing a new version of the package and re-tagging', () => {
      before(() => {
        npmCiRegistry.publishPackage(examplePkg, '0.0.2');
        helper.command.tagAllComponents('--unmodified');
        helper.command.export();
      });
      it('should update the dep in the env model', () => {
        validatePkgData();
      });
      it('should be able to install the env on a new workspace with no errors and install the latest of the pkg dep', () => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.command.install(helper.general.getPackageNameByCompName('empty-env'));

        const envPkgJson = helper.fs.readJsonFile(
          `node_modules/${helper.general.getPackageNameByCompName('empty-env')}/package.json`
        );
        expect(envPkgJson.dependencies[examplePkg]).to.equal('*');

        const pkgJsonPath = path.join('node_modules', '.pnpm/@ci+lodash@0.0.2/node_modules/@ci/lodash/package.json');
        const pkgJson = helper.fs.readJsonFile(pkgJsonPath);
        expect(pkgJson.version).to.equal('0.0.2');
      });
    });
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('component range support', () => {
    let npmCiRegistry: NpmCiRegistry;
    let wsAfterExport: string;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();

      helper.fixtures.populateComponents(3);

      helper.workspaceJsonc.addKeyValToDependencyResolver('componentRangePrefix', '^');

      helper.command.tagAllComponents();
      helper.command.export();
      wsAfterExport = helper.scopeHelper.cloneWorkspace();
    });
    after(() => {
      npmCiRegistry.destroy();
      helper.scopeHelper.destroy();
    });
    it('should save the dependencies with rangePrefix', () => {
      const comp2Pkg = helper.general.getPackageNameByCompName('comp2');
      const depsData = helper.command.showDependenciesData('comp1');
      const comp2Dep = depsData.find((d) => d.packageName === comp2Pkg);
      expect(comp2Dep).to.have.property('versionRange');
      expect(comp2Dep!.versionRange).to.equal('^0.0.1');
    });
    it('installing a component should have the dependencies with range in the package.json', () => {
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      const comp1Pkg = helper.general.getPackageNameByCompName('comp1');
      helper.command.install(comp1Pkg);
      const pkgJson = helper.fs.readJsonFile(`node_modules/${comp1Pkg}/package.json`);
      expect(pkgJson.dependencies[helper.general.getPackageNameByCompName('comp2')]).to.equal('^0.0.1');
    });
    describe('workspace with only the dependent', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        npmCiRegistry.setResolver();
        helper.command.importComponent('comp1');
        helper.workspaceJsonc.addKeyValToDependencyResolver('componentRangePrefix', '^');

        helper.command.tagAllComponents('--unmodified');
      });
      it('should keep the dependency with the range', () => {
        const comp1 = helper.command.catComponent('comp1@latest');
        const pkgExtensionData = helper.command.getAspectsData(comp1, Extensions.pkg).data;
        const comp2Pkg = helper.general.getPackageNameByCompName('comp2');
        expect(pkgExtensionData.pkgJson.dependencies).to.have.property(comp2Pkg);
        expect(pkgExtensionData.pkgJson.dependencies[comp2Pkg]).to.equal(`^0.0.1`);
      });
    });
    describe('component-package exists in workspace.jsonc', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(wsAfterExport);
        helper.command.tagAllComponents('--ver 2.0.0 --unmodified');
        helper.command.export();

        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        npmCiRegistry.setResolver();
        helper.command.importComponent('comp1');
        helper.workspaceJsonc.addKeyValToDependencyResolver('componentRangePrefix', '^');
        const comp2Pkg = helper.general.getPackageNameByCompName('comp2');
        helper.command.install(`${comp2Pkg}@^0.0.1`);
        helper.command.tagAllComponents();
      });
      it('should keep the dependency with the range', () => {
        const comp1 = helper.command.catComponent('comp1@latest');
        const pkgExtensionData = helper.command.getAspectsData(comp1, Extensions.pkg).data;
        const comp2Pkg = helper.general.getPackageNameByCompName('comp2');
        expect(pkgExtensionData.pkgJson.dependencies).to.have.property(comp2Pkg);
        expect(pkgExtensionData.pkgJson.dependencies[comp2Pkg]).to.equal(`^0.0.1`);
      });
    });
    describe('removing componentRangePrefix from the workspace', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(wsAfterExport);
        helper.workspaceJsonc.addKeyValToDependencyResolver('componentRangePrefix', '');
        helper.command.tagComponent('comp1', undefined, '--ver 3.0.0 --unmodified');
      });
      it('should keep the dependency with the range', () => {
        const comp1 = helper.command.catComponent('comp1@latest');
        const pkgExtensionData = helper.command.getAspectsData(comp1, Extensions.pkg).data;
        const comp2Pkg = helper.general.getPackageNameByCompName('comp2');
        expect(pkgExtensionData.pkgJson.dependencies).to.have.property(comp2Pkg);
        expect(pkgExtensionData.pkgJson.dependencies[comp2Pkg]).to.equal(`^0.0.1`);
      });
    });
    describe('revert the range by setting the prefix to minus', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(wsAfterExport);
        helper.workspaceJsonc.addKeyValToDependencyResolver('componentRangePrefix', '-');
        helper.command.tagComponent('comp1', undefined, '--ver 4.0.0 --unmodified');
      });
      it('should save the dependency without the range', () => {
        const comp1 = helper.command.catComponent('comp1@latest');
        const pkgExtensionData = helper.command.getAspectsData(comp1, Extensions.pkg).data;
        const comp2Pkg = helper.general.getPackageNameByCompName('comp2');
        expect(pkgExtensionData.pkgJson.dependencies).to.have.property(comp2Pkg);
        expect(pkgExtensionData.pkgJson.dependencies[comp2Pkg]).to.equal(`0.0.1`);
      });
    });
    describe('range in config conflicts the actual range in policy', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        npmCiRegistry.setResolver();
        helper.command.importComponent('comp1');
        helper.workspaceJsonc.addKeyValToDependencyResolver('componentRangePrefix', '^');
        const comp2Pkg = helper.general.getPackageNameByCompName('comp2');
        helper.command.install(`${comp2Pkg}@~0.0.1`);
        helper.command.tagAllWithoutBuild('--unmodified');
      });
      it('the range in policy should win', () => {
        const comp2Pkg = helper.general.getPackageNameByCompName('comp2');
        const depsData = helper.command.showDependenciesData('comp1');
        const comp2Dep = depsData.find((d) => d.packageName === comp2Pkg);
        expect(comp2Dep).to.have.property('versionRange');
        expect(comp2Dep!.versionRange).to.equal('~0.0.1');
      });
    });
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('component range as "+"', () => {
    let npmCiRegistry: NpmCiRegistry;
    let wsAfterExport: string;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllComponents();
      helper.command.export();
      wsAfterExport = helper.scopeHelper.cloneWorkspace();
    });
    after(() => {
      npmCiRegistry.destroy();
      helper.scopeHelper.destroy();
    });
    describe('tagging the dependent only', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        npmCiRegistry.setResolver();
        helper.command.importComponent('comp1');

        const comp2Pkg = helper.general.getPackageNameByCompName('comp2');
        helper.command.dependenciesSet('comp1', `${comp2Pkg}@~0.0.1`);
        helper.workspaceJsonc.addKeyValToDependencyResolver('componentRangePrefix', '+');

        helper.command.tagAllWithoutBuild('--unmodified');
      });
      it('should save the prefix according to how the user saved it via bit-deps-set', () => {
        const comp2Pkg = helper.general.getPackageNameByCompName('comp2');
        const depsData = helper.command.showDependenciesData('comp1');
        const comp2Dep = depsData.find((d) => d.packageName === comp2Pkg);
        expect(comp2Dep).to.have.property('versionRange');
        expect(comp2Dep!.versionRange).to.equal('~0.0.1');
      });
    });
    describe('tagging both the dependent and the dependency', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(wsAfterExport);
        helper.workspaceJsonc.addKeyValToDependencyResolver('componentRangePrefix', '+');
        helper.command.tagAllWithoutBuild('--unmodified');
      });
      it('should not save any prefix', () => {
        const comp2Pkg = helper.general.getPackageNameByCompName('comp2');
        const depsData = helper.command.showDependenciesData('comp1');
        const comp2Dep = depsData.find((d) => d.packageName === comp2Pkg);
        expect(comp2Dep).to.not.have.property('versionRange');
      });
    });
  });
  describe('component range support with snaps', () => {
    before(() => {
      helper = new Helper();
    });
    describe('when snapping with ^ prefix', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.fixtures.populateComponents(2);
        helper.workspaceJsonc.addKeyValToDependencyResolver('componentRangePrefix', '^');
        helper.command.snapAllComponents();
      });

      it('should not apply ^ prefix to snap versions in dependency data', () => {
        const comp2Pkg = helper.general.getPackageNameByCompName('comp2', false);
        const depsData = helper.command.showDependenciesData('comp1');
        const comp2Dep = depsData.find((d) => d.packageName === comp2Pkg);
        expect(comp2Dep).to.have.property('version');

        const snapVersion = comp2Dep!.version;
        expect(snapVersion).to.not.include('^');
      });

      it('generated package.json should not have invalid semver with ^ prefix', () => {
        const comp1 = helper.command.catComponent('comp1@latest');
        const pkgExtensionData = helper.command.getAspectsData(comp1, Extensions.pkg).data;
        const comp2Pkg = helper.general.getPackageNameByCompName('comp2', false);

        expect(pkgExtensionData.pkgJson.dependencies).to.have.property(comp2Pkg);
        const dependencyVersion = pkgExtensionData.pkgJson.dependencies[comp2Pkg];

        expect(dependencyVersion).to.not.include('^');
      });
    });

    describe('when snapping with ~ prefix', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.fixtures.populateComponents(2);
        helper.workspaceJsonc.addKeyValToDependencyResolver('componentRangePrefix', '~');
        helper.command.snapAllComponents();
      });

      it('should not apply ~ prefix to snap versions in dependency data', () => {
        const comp2Pkg = helper.general.getPackageNameByCompName('comp2', false);
        const depsData = helper.command.showDependenciesData('comp1');
        const comp2Dep = depsData.find((d) => d.packageName === comp2Pkg);
        expect(comp2Dep).to.have.property('version');

        const snapVersion = comp2Dep!.version;
        expect(snapVersion).to.not.include('~');
      });

      it('generated package.json should not have invalid semver with ~ prefix', () => {
        const comp1 = helper.command.catComponent('comp1@latest');
        const pkgExtensionData = helper.command.getAspectsData(comp1, Extensions.pkg).data;
        const comp2Pkg = helper.general.getPackageNameByCompName('comp2', false);

        expect(pkgExtensionData.pkgJson.dependencies).to.have.property(comp2Pkg);
        const dependencyVersion = pkgExtensionData.pkgJson.dependencies[comp2Pkg];

        expect(dependencyVersion).to.not.include('~');
      });
    });
  });
});
