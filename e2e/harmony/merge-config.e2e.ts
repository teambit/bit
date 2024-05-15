import { IssuesClasses } from '@teambit/component-issues';
import fs from 'fs-extra';
import chai, { expect } from 'chai';
import { Extensions } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));

describe('merge config scenarios', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('diverge with different component versions', () => {
    let npmCiRegistry: NpmCiRegistry;
    let beforeDiverge: string;
    let beforeMerges: string;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(3);
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCiInPackageJsonHarmony();
      await npmCiRegistry.init();
      helper.command.tagAllComponents();
      helper.command.export();
      beforeDiverge = helper.scopeHelper.cloneLocalScope();
      helper.command.createLane();
      helper.fixtures.populateComponents(3, undefined, 'on-lane');
      helper.command.deprecateComponent('comp1');
      helper.command.snapAllComponents();
      helper.command.export();
      helper.command.publish('"**"');

      helper.scopeHelper.getClonedLocalScope(beforeDiverge);
      helper.fixtures.populateComponents(3, undefined, 'v2');
      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      npmCiRegistry.setResolver();
      helper.command.importComponent('comp1');
      beforeMerges = helper.scopeHelper.cloneLocalScope();
    });
    after(() => {
      npmCiRegistry.destroy();
    });
    describe('merging the lane to main', () => {
      before(() => {
        helper.command.mergeLane(`${helper.scopes.remote}/dev`, '--manual --no-squash');
        // fixes the conflicts
        helper.fs.outputFile(`${helper.scopes.remoteWithoutOwner}/comp1/index.js`);
        helper.fs.outputFile(`${helper.scopes.remoteWithoutOwner}/comp2/index.js`);
        helper.fs.outputFile(`${helper.scopes.remoteWithoutOwner}/comp3/index.js`);
      });
      it('should keep the configuration from the lane', () => {
        const deprecationData = helper.command.showAspectConfig('comp1', Extensions.deprecation);
        expect(deprecationData.config.deprecate).to.be.true;
      });
      // not relevant anymore, we don't auto-merge when the dep is in the workspace or in the lane.
      // describe('snapping the components', () => {
      //   before(() => {
      //     helper.command.install();
      //     helper.command.compile();
      //     helper.command.snapAllComponentsWithoutBuild();
      //   });
      //   it('should not save it with force: true in the model after snapping', () => {
      //     const cmp = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`);
      //     const depResolver = cmp.extensions.find((e) => e.name === Extensions.dependencyResolver);
      //     const policy = depResolver.data.policy;
      //     const comp2 = policy.find((p) => p.dependencyId === `${helper.general.getPackageNameByCompName('comp2')}`);
      //     expect(comp2.force).to.equal(false);
      //   });
      // });
    });
    describe('switching to the lane', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeMerges);
        helper.command.switchRemoteLane('dev', undefined, false);
      });
      // previously it was showing it as modified due to dependencies changes
      it('should not show the component as modified', () => {
        expect(helper.command.statusComponentIsModified('comp1')).to.be.false;
      });
      // previously it tried to install with the snap as the version.
      it('should be able to install the correct versions after deleting node-modules', () => {
        helper.fs.deletePath('node_modules');
        expect(() => helper.command.install()).not.to.throw('No matching version found');
      });
      describe('merge from main to the lane', () => {
        before(() => {
          helper.command.mergeLane('main', '--manual');
        });
        // previous bug, showed only comp1 as componentsDuringMergeState, but the rest, because they're not in the
        // workspace, it didn't merge them correctly.
        it('bit status should show all components as componentsDuringMergeState and not in pendingUpdatesFromMain', () => {
          const status = helper.command.statusJson();
          expect(status.componentsDuringMergeState).to.have.lengthOf(3);
          expect(status.pendingUpdatesFromMain).to.have.lengthOf(0);
        });
      });
    });
  });
  describe('diverge with config that is possible to merge', () => {
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      const mainBeforeDiverge = helper.scopeHelper.cloneLocalScope();

      helper.command.createLane();
      helper.command.deprecateComponent('comp1');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.getClonedLocalScope(mainBeforeDiverge);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.mergeLane(`${helper.scopes.remote}/dev`, '--no-snap --skip-dependency-installation --no-squash');
    });
    it('bit status should not show the component with an issue of MergeConfigHasConflict', () => {
      helper.command.expectStatusToNotHaveIssue(IssuesClasses.MergeConfigHasConflict.name);
    });
    it('should show the component deprecated due to the successful merge-config', () => {
      const deprecationData = helper.command.showAspectConfig('comp1', Extensions.deprecation);
      expect(deprecationData.config.deprecate).to.be.true;
    });
    it('should not generate merge-conflict file, instead, the merge data should be in unmerged file', () => {
      const configPath = helper.general.getConfigMergePath();
      expect(configPath).to.not.be.a.path();
    });
  });
  describe('diverge with conflicted config', () => {
    let mainBeforeDiverge: string;
    let beforeConfigResolved: string;
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      mainBeforeDiverge = helper.scopeHelper.cloneLocalScope();

      helper.command.createLane();
      helper.command.deprecateComponent('comp1');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.getClonedLocalScope(mainBeforeDiverge);
      helper.command.deprecateComponent('comp1');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.undeprecateComponent('comp1');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importLane('dev');
      helper.command.mergeLane('main', '--no-snap --skip-dependency-installation');
      beforeConfigResolved = helper.scopeHelper.cloneLocalScope();
    });
    it('bit status should show the component with an issue of MergeConfigHasConflict', () => {
      helper.command.expectStatusToHaveIssue(IssuesClasses.MergeConfigHasConflict.name);
    });
    describe('fixing the conflict with ours', () => {
      before(() => {
        helper.general.fixMergeConfigConflict('ours');
      });
      it('should show the component deprecated', () => {
        const deprecationData = helper.command.showAspectConfig('comp1', Extensions.deprecation);
        expect(deprecationData.config.deprecate).to.be.true;
      });
    });
    describe('fixing the conflict with theirs', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeConfigResolved);
        helper.general.fixMergeConfigConflict('theirs');
      });
      it('should show the component as undeprecated', () => {
        const deprecationData = helper.command.showAspectConfig('comp1', Extensions.deprecation);
        expect(deprecationData.config.deprecate).to.be.false;
      });
    });
    describe('snapping the components', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeConfigResolved);
        helper.general.fixMergeConfigConflict('theirs');
        helper.command.snapAllComponentsWithoutBuild();
      });
      it('should delete the config-merge file', () => {
        const configMergePath = helper.general.getConfigMergePath();
        expect(configMergePath).to.not.be.a.path();
      });
    });
  });
  describe('diverge with different dependencies config', () => {
    let mainBeforeDiverge: string;
    let beforeMerge: string;
    let beforeConfigResolved: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.dependenciesSet('comp1', 'lodash@3.3.1');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      mainBeforeDiverge = helper.scopeHelper.cloneLocalScope();

      helper.command.createLane();
      helper.command.deprecateComponent('comp1');
      helper.command.dependenciesSet('comp1', 'ramda@0.0.20', '--dev');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.getClonedLocalScope(mainBeforeDiverge);
      helper.command.deprecateComponent('comp1');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.undeprecateComponent('comp1');
      helper.command.dependenciesSet('comp1', 'ramda@0.0.21', '--dev');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importLane('dev', '--skip-dependency-installation');
      beforeMerge = helper.scopeHelper.cloneLocalScope();
      helper.command.mergeLane('main', '--no-snap --skip-dependency-installation');
      beforeConfigResolved = helper.scopeHelper.cloneLocalScope();
    });
    it('bit status should show the component with an issue of MergeConfigHasConflict', () => {
      helper.command.expectStatusToHaveIssue(IssuesClasses.MergeConfigHasConflict.name);
    });
    describe('fixing the conflict with ours', () => {
      before(() => {
        helper.general.fixMergeConfigConflict('ours');
      });
      it('should show the dev-dependency as it was set on the lane', () => {
        const showConfig = helper.command.showAspectConfig('comp1', Extensions.dependencyResolver);
        const ramdaDep = showConfig.data.dependencies.find((d) => d.id === 'ramda');
        expect(ramdaDep.version).to.equal('0.0.20');
        expect(ramdaDep.lifecycle).to.equal('dev');
      });
    });
    describe('fixing the conflict with theirs', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeConfigResolved);
        helper.general.fixMergeConfigConflict('theirs');
      });
      it('should show the dev-dependency as it was set on main', () => {
        const showConfig = helper.command.showAspectConfig('comp1', Extensions.dependencyResolver);
        const ramdaDep = showConfig.data.dependencies.find((d) => d.id === 'ramda');
        expect(ramdaDep.version).to.equal('0.0.21');
      });
      it('running bit deps set of another pkg, should work', () => {
        helper.command.dependenciesSet('comp1', 'lodash@1.0.0', '--dev');
        const showConfig = helper.command.showAspectConfig('comp1', Extensions.dependencyResolver);
        const lodashDep = showConfig.data.dependencies.find((d) => d.id === 'lodash');
        expect(lodashDep.version).to.equal('1.0.0');
      });
    });
    describe('merging with --auto-merge-resolve ours', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeMerge);
        helper.command.mergeLane('main', '--no-snap --skip-dependency-installation --auto-merge-resolve=ours');
      });
      it('should not generate the config-merge file', () => {
        const configMerge = helper.general.getConfigMergePath();
        expect(configMerge).to.not.be.a.path();
      });
      it('should show the dev-dependency as it was set on the lane', () => {
        const showConfig = helper.command.showAspectConfig('comp1', Extensions.dependencyResolver);
        const ramdaDep = showConfig.data.dependencies.find((d) => d.id === 'ramda');
        expect(ramdaDep.version).to.equal('0.0.20');
        expect(ramdaDep.lifecycle).to.equal('dev');
      });
    });
    describe('merging with --auto-merge-resolve theirs', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeMerge);
        helper.command.mergeLane('main', '--no-snap --skip-dependency-installation --auto-merge-resolve=theirs');
      });
      it('should not generate the config-merge file', () => {
        const configMerge = helper.general.getConfigMergePath();
        expect(configMerge).to.not.be.a.path();
      });
      it('should show the dev-dependency as it was set on main', () => {
        const showConfig = helper.command.showAspectConfig('comp1', Extensions.dependencyResolver);
        const ramdaDep = showConfig.data.dependencies.find((d) => d.id === 'ramda');
        expect(ramdaDep.version).to.equal('0.0.21');
      });
    });
  });
  describe('diverge with different dependencies config when "other" adds a package (current === base)', () => {
    let mainBeforeDiverge: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.dependenciesSet('comp1', 'lodash@3.3.1');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      mainBeforeDiverge = helper.scopeHelper.cloneLocalScope();

      helper.command.createLane();
      helper.command.dependenciesSet('comp1', 'ramda@0.0.20');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.getClonedLocalScope(mainBeforeDiverge);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();

      helper.command.mergeLane('dev', '--no-snap -x --no-squash');
    });
    // previously, it was ignoring the previous config and only adding "ramda".
    it('should not remove the packages it had previously via deps set', () => {
      const dependencies = helper.command.getCompDepsIdsFromData('comp1');
      expect(dependencies).to.include('lodash');
    });
  });
  describe('diverge with different auto-detected dependencies config', () => {
    let mainBeforeDiverge: string;
    let beforeConfigResolved: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile('comp1/index.js', `import R from 'ramda';`);
      helper.npm.addFakeNpmPackage('ramda', '0.0.19');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      mainBeforeDiverge = helper.scopeHelper.cloneLocalScope();

      helper.command.createLane();
      helper.npm.addFakeNpmPackage('ramda', '0.0.20');
      helper.workspaceJsonc.addPolicyToDependencyResolver({ dependencies: { ramda: '0.0.20' } });
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.getClonedLocalScope(mainBeforeDiverge);
      helper.npm.addFakeNpmPackage('ramda', '0.0.21');
      helper.workspaceJsonc.addPolicyToDependencyResolver({ dependencies: { ramda: '0.0.21' } });
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importLane('dev', '--skip-dependency-installation');
      helper.command.mergeLane('main', '--no-snap --skip-dependency-installation --ignore-config-changes');
      beforeConfigResolved = helper.scopeHelper.cloneLocalScope();
    });
    it('bit status should show the component with an issue of MergeConfigHasConflict', () => {
      helper.command.expectStatusToHaveIssue(IssuesClasses.MergeConfigHasConflict.name);
    });
    describe('fixing the conflict with ours', () => {
      before(() => {
        helper.general.fixMergeConfigConflict('ours');
      });
      it('should show the dev-dependency as it was set on the lane', () => {
        const showConfig = helper.command.showAspectConfig('comp1', Extensions.dependencyResolver);
        const ramdaDep = showConfig.data.dependencies.find((d) => d.id === 'ramda');
        expect(ramdaDep.version).to.equal('0.0.20');
        expect(ramdaDep.lifecycle).to.equal('runtime');
      });
    });
    describe('fixing the conflict with theirs', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeConfigResolved);
        helper.general.fixMergeConfigConflict('theirs');
      });
      it('should show the dev-dependency as it was set on main', () => {
        const showConfig = helper.command.showAspectConfig('comp1', Extensions.dependencyResolver);
        const ramdaDep = showConfig.data.dependencies.find((d) => d.id === 'ramda');
        expect(ramdaDep.version).to.equal('0.0.21');
      });
      it('running bit deps set of another pkg, should work', () => {
        helper.command.dependenciesSet('comp1', 'lodash@1.0.0', '--dev');
        const showConfig = helper.command.showAspectConfig('comp1', Extensions.dependencyResolver);
        const lodashDep = showConfig.data.dependencies.find((d) => d.id === 'lodash');
        expect(lodashDep.version).to.equal('1.0.0');
      });
    });
  });
  describe('diverge with envs changes', () => {
    let mainBeforeDiverge: string;
    let beforeConfigResolved: string;
    let envName: string;
    let envId: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      envName = helper.env.setCustomEnv();
      envId = `${helper.scopes.remote}/${envName}`;
      helper.command.setEnv('comp1', envId);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.tagWithoutBuild(envName, '--skip-auto-tag --unmodified'); // 0.0.2
      helper.command.tagWithoutBuild(envName, '--skip-auto-tag --unmodified'); // 0.0.3

      helper.command.export();
      mainBeforeDiverge = helper.scopeHelper.cloneLocalScope();

      helper.command.createLane();
      helper.command.setEnv('comp1', `${envId}@0.0.2`);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.getClonedLocalScope(mainBeforeDiverge);
      // helper.command.setEnv('comp1', `${envId}@0.0.3`);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importLane('dev', '--skip-dependency-installation');
      helper.command.mergeLane('main', '--no-snap --skip-dependency-installation');
      beforeConfigResolved = helper.scopeHelper.cloneLocalScope();
    });
    it('bit status should show the component with an issue of MergeConfigHasConflict', () => {
      helper.command.expectStatusToHaveIssue(IssuesClasses.MergeConfigHasConflict.name);
    });
    it('the conflict file should only contain env data and not dependencyResolver data', () => {
      const conflictFile = helper.general.getConfigMergePath();
      const conflictFileContent = fs.readFileSync(conflictFile).toString();
      expect(conflictFileContent).to.have.string(Extensions.envs);
      expect(conflictFileContent).to.not.have.string(Extensions.dependencyResolver);
    });
    describe('fixing the conflict with ours', () => {
      before(() => {
        helper.general.fixMergeConfigConflict('ours');
      });
      it('should set the env according to the lane', () => {
        const envConfig = helper.command.showAspectConfig('comp1', Extensions.envs);
        expect(envConfig.config.env).to.equal(envId);

        const env = helper.command.showAspectConfig('comp1', `${envId}@0.0.2`);
        expect(env.config).to.deep.equal({});

        const nonEnv = helper.command.showAspectConfig('comp1', `${envId}@0.0.3`);
        expect(nonEnv).to.be.undefined;
      });
      it('should show the dev-dependency as it was set on the lane', () => {
        const showConfig = helper.command.showAspectConfig('comp1', Extensions.dependencyResolver);
        const nodeDep = showConfig.data.dependencies.find((d) => d.id === `${envId}@0.0.2`);
        expect(nodeDep.version).to.equal('0.0.2');
        expect(nodeDep.lifecycle).to.equal('dev');

        const nonDep = showConfig.data.dependencies.find((d) => d.id === `${envId}@0.0.3`);
        expect(nonDep).to.be.undefined;
      });
    });
    describe('fixing the conflict with theirs', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeConfigResolved);
        helper.general.fixMergeConfigConflict('theirs');
      });
      it('should set the env according to the lane', () => {
        // run the status, so then, the pkg manager will install everything and the next "show --json" will be a valid json
        helper.command.status();
        const envConfig = helper.command.showAspectConfig('comp1', Extensions.envs);
        expect(envConfig.config.env).to.equal(envId);

        const env = helper.command.showAspectConfig('comp1', `${envId}@0.0.3`);
        expect(env.config).to.deep.equal({});

        const nonEnv = helper.command.showAspectConfig('comp1', `${envId}@0.0.2`);
        expect(nonEnv).to.be.undefined;
      });
      it('should show the dev-dependency as it was set on main', () => {
        const showConfig = helper.command.showAspectConfig('comp1', Extensions.dependencyResolver);
        const nodeDep = showConfig.data.dependencies.find((d) => d.id === `${envId}@0.0.3`);
        expect(nodeDep.version).to.equal('0.0.3');
        expect(nodeDep.lifecycle).to.equal('dev');

        const nonDep = showConfig.data.dependencies.find((d) => d.id === `${envId}@0.0.2`);
        expect(nonDep).to.be.undefined;
      });
    });
  });
  // for this test, there are two workspace.
  // 1. includes a component "bar/foo" which is used as a package for the another workspace.
  // 2. has a component "comp1", which uses bar.foo pkg in different versions.
  // we maintain two "Helper" instances to gradually update both workspaces.
  (supportNpmCiRegistryTesting ? describe : describe.skip)(
    'diverge with different component dependencies versions',
    () => {
      let npmCiRegistry: NpmCiRegistry;
      let beforeDiverge: string;
      let beforeMerges: string;
      let barPkgName: string;
      let barCompName: string;
      let pkgHelper: Helper;
      before(async () => {
        pkgHelper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
        pkgHelper.scopeHelper.setNewLocalAndRemoteScopes();
        pkgHelper.fixtures.createComponentBarFoo();
        pkgHelper.fixtures.addComponentBarFoo();
        npmCiRegistry = new NpmCiRegistry(pkgHelper);
        npmCiRegistry.configureCiInPackageJsonHarmony();
        await npmCiRegistry.init();
        pkgHelper.command.tagAllComponents();
        barPkgName = pkgHelper.general.getPackageNameByCompName('bar/foo');
        barCompName = `${pkgHelper.scopes.remote}/bar/foo`;
        pkgHelper.command.export();

        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.scopeHelper.addRemoteScope(pkgHelper.scopes.remotePath);
        helper.fixtures.populateComponents(1, false);
        helper.fs.outputFile('comp1/index.js', `require("${barPkgName}");`);
        helper.command.install(barPkgName);
        helper.command.tagAllWithoutBuild();
        helper.command.export();
        beforeDiverge = helper.scopeHelper.cloneLocalScope();

        pkgHelper.command.tagAllComponents('--unmodified'); // 0.0.2
        pkgHelper.command.export();

        helper.command.createLane();
        helper.command.install(`${barPkgName}@0.0.2`);
        helper.command.snapAllComponentsWithoutBuild();
        helper.command.export();

        // add another tag on main to make it diverged from the lane.
        helper.scopeHelper.getClonedLocalScope(beforeDiverge);
        helper.command.tagAllWithoutBuild('--unmodified');
        helper.command.export();

        beforeMerges = helper.scopeHelper.cloneLocalScope();
      });
      after(() => {
        npmCiRegistry.destroy();
      });
      describe('when the dep was updated on the lane only, not on main', () => {
        describe('when the dep is in workspace.jsonc', () => {
          before(() => {
            helper.command.mergeLane(`${helper.scopes.remote}/dev --no-squash --no-snap`);
          });
          it('should change workspace.jsonc with the updated dependency', () => {
            const policy = helper.workspaceJsonc.getPolicyFromDependencyResolver();
            expect(policy.dependencies[barPkgName]).to.equal('0.0.2');
          });
        });
        describe('when the dep is not in the workspace.jsonc', () => {
          before(() => {
            helper.scopeHelper.getClonedLocalScope(beforeMerges);
            helper.workspaceJsonc.addPolicyToDependencyResolver({ dependencies: {} });
            helper.command.mergeLane(`${helper.scopes.remote}/dev --no-squash --no-snap`);
          });
          it('should auto-update the dependency according to the lane, because only there it was changed', () => {
            const deps = helper.command.getCompDepsIdsFromData('comp1');
            expect(deps).to.include(`${barCompName}@0.0.2`);
            expect(deps).to.not.include(`${barCompName}@0.0.1`);
          });
          describe('when installing a different version than the resolved one', () => {
            before(() => {
              helper.command.install(`${barPkgName}@0.0.1`);
            });
            it('should resolve from workspace.jsonc and not from unmerged file', () => {
              const deps = helper.command.getCompDepsIdsFromData('comp1');
              expect(deps).to.include(`${barCompName}@0.0.1`);
              expect(deps).to.not.include(`${barCompName}@0.0.2`);
            });
          });
        });
      });
      describe('when the dep was updated in both, the lane and main so there is a conflict', () => {
        let afterExport: string;
        before(() => {
          pkgHelper.command.tagAllComponents('--unmodified'); // 0.0.3
          pkgHelper.command.export();

          // on main
          helper.scopeHelper.getClonedLocalScope(beforeMerges);
          helper.command.install(`${barPkgName}@0.0.3`);
          // by default, it is saved as ^0.0.3 to the workspace.jsonc
          helper.command.tagAllWithoutBuild();
          helper.command.export();
          afterExport = helper.scopeHelper.cloneLocalScope();
        });
        describe('when the dep is in workspace.jsonc', () => {
          before(() => {
            helper.command.mergeLane(`${helper.scopes.remote}/dev --no-squash --no-snap`);
          });
          it('should not write config-merge file', () => {
            const conflictFile = helper.general.getConfigMergePath();
            expect(conflictFile).to.not.be.a.path();
          });
          it('should show the versions as conflicted in workspace.jsonc file', () => {
            const wsJsonc = helper.workspaceJsonc.readRaw();
            expect(wsJsonc).to.have.string(`<<<<<<< ours
        "${barPkgName}": "0.0.3"
=======
        "${barPkgName}": "0.0.2"
>>>>>>> theirs`);
          });
          it('should throw for any command until the conflicts are resolved', () => {
            expect(() => helper.command.status()).to.throw('please fix the conflicts in workspace.jsonc to continue');
          });
        });
        describe('when the dep is not in the workspace.jsonc', () => {
          before(() => {
            helper.scopeHelper.getClonedLocalScope(afterExport);
            helper.workspaceJsonc.addPolicyToDependencyResolver({ dependencies: {} });
            helper.command.mergeLane(`${helper.scopes.remote}/dev --no-squash --no-snap`);
          });
          it('bit status should not show a workspace issue', () => {
            const status = helper.command.statusJson();
            expect(status.workspaceIssues).to.have.lengthOf(0);
          });
          it('bit status should show it as a component conflict', () => {
            const status = helper.command.statusJson();
            expect(status.componentsWithIssues).to.have.lengthOf(1);
            expect(status.componentsWithIssues[0].id).to.includes('comp1');
            expect(status.componentsWithIssues[0].issues[0].type).to.equal(IssuesClasses.MergeConfigHasConflict.name);
          });
        });
      });
    }
  );
  (supportNpmCiRegistryTesting ? describe : describe.skip)(
    'diverge with multiple components, each has a different dependency version',
    () => {
      let npmCiRegistry: NpmCiRegistry;
      let beforeDiverge: string;
      let barPkgName: string;
      // let barCompName: string;
      let pkgHelper: Helper;
      let laneWs: string;
      before(async () => {
        pkgHelper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
        pkgHelper.scopeHelper.setNewLocalAndRemoteScopes();
        pkgHelper.fixtures.createComponentBarFoo();
        pkgHelper.fixtures.addComponentBarFoo();
        npmCiRegistry = new NpmCiRegistry(pkgHelper);
        npmCiRegistry.configureCiInPackageJsonHarmony();
        await npmCiRegistry.init();
        pkgHelper.command.tagAllComponents();
        barPkgName = pkgHelper.general.getPackageNameByCompName('bar/foo');
        // barCompName = `${pkgHelper.scopes.remote}/bar/foo`;
        pkgHelper.command.export();

        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.scopeHelper.addRemoteScope(pkgHelper.scopes.remotePath);
        helper.fixtures.populateComponents(2);
        helper.fs.outputFile('comp1/index.js', `require("${barPkgName}");`);
        helper.fs.outputFile('comp2/index.js', `require("${barPkgName}");`);
        helper.command.install(barPkgName);
        helper.command.tagAllWithoutBuild();
        helper.command.export();
        beforeDiverge = helper.scopeHelper.cloneLocalScope();

        helper.command.createLane();
        helper.command.snapAllComponentsWithoutBuild('--unmodified'); // add another snap to make it diverged from main.
        helper.command.export();
        laneWs = helper.scopeHelper.cloneLocalScope();

        pkgHelper.command.tagAllComponents('--unmodified'); // 0.0.2
        pkgHelper.command.export();

        helper.scopeHelper.getClonedLocalScope(beforeDiverge);
        helper.command.install(`${barPkgName}@0.0.2`);
        helper.command.tagAllWithoutBuild();
        helper.command.export();

        pkgHelper.command.tagAllComponents('--unmodified'); // 0.0.3
        pkgHelper.command.export();

        helper.command.install(`${barPkgName}@0.0.3`);
        helper.command.tagComponent('comp1');
        helper.command.export();
      });
      after(() => {
        npmCiRegistry.destroy();
      });
      describe('when the dep was updated on the lane only, not on main', () => {
        describe('when the dep is in workspace.jsonc', () => {
          let mergeOutput: string;
          before(() => {
            helper.scopeHelper.getClonedLocalScope(laneWs);
            mergeOutput = helper.command.mergeLane(`main --no-snap -x`);
          });
          it('should not update workspace.jsonc', () => {
            const policy = helper.workspaceJsonc.getPolicyFromDependencyResolver();
            expect(policy.dependencies[barPkgName]).to.equal('^0.0.1');
          });
          it('should tell why workspace.jsonc was not updated', () => {
            expect(mergeOutput).to.have.string('workspace.jsonc was unable to update the following dependencies');
            expect(mergeOutput).to.have.string(`multiple versions found`);
            expect(mergeOutput).to.have.string(`0.0.3 (by ${helper.scopes.remote}/comp1)`);
            expect(mergeOutput).to.have.string(`0.0.2 (by ${helper.scopes.remote}/comp2)`);
          });
        });
      });
    }
  );
  describe('diverge with merge-able auto-detected dependencies config and pre-config explicitly set', () => {
    let mainBeforeDiverge: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile('comp1/index.js', `import R from 'ramda';`);
      helper.npm.addFakeNpmPackage('ramda', '0.0.19');
      helper.npm.addFakeNpmPackage('lodash', '4.2.4');
      helper.command.dependenciesSet('comp1', 'lodash@4.2.4');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      mainBeforeDiverge = helper.scopeHelper.cloneLocalScope();

      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();

      helper.scopeHelper.getClonedLocalScope(mainBeforeDiverge);
      helper.npm.addFakeNpmPackage('ramda', '0.0.21');
      helper.workspaceJsonc.addPolicyToDependencyResolver({ dependencies: { ramda: '0.0.21' } });
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importLane('dev', '--skip-dependency-installation');
      helper.command.mergeLane('main', '--no-snap --skip-dependency-installation --ignore-config-changes');
    });
    it('should not delete the previously deps set', () => {
      const deps = helper.command.getCompDepsIdsFromData('comp1');
      expect(deps).to.include('lodash');
    });
  });
});
