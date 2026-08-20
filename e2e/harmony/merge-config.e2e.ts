import { IssuesClasses } from '@teambit/component-issues';
import chai, { expect } from 'chai';
import { Extensions } from '@teambit/legacy.constants';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
chai.use(chaiFs);
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCiInPackageJsonHarmony();
      await npmCiRegistry.init();
      helper.command.tagAllComponents();
      helper.command.export();
      beforeDiverge = helper.scopeHelper.cloneWorkspace();
      helper.command.createLane();
      helper.fixtures.populateComponents(3, undefined, 'on-lane');
      helper.command.deprecateComponent('comp1');
      helper.command.snapAllComponents();
      helper.command.export();
      helper.command.publish('"**"');

      helper.scopeHelper.getClonedWorkspace(beforeDiverge);
      helper.fixtures.populateComponents(3, undefined, 'v2');
      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      npmCiRegistry.setResolver();
      helper.command.importComponent('comp1');
      beforeMerges = helper.scopeHelper.cloneWorkspace();
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
        helper.scopeHelper.getClonedWorkspace(beforeMerges);
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      const mainBeforeDiverge = helper.scopeHelper.cloneWorkspace();

      helper.command.createLane();
      helper.command.deprecateComponent('comp1');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.getClonedWorkspace(mainBeforeDiverge);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.mergeLane(
        `${helper.scopes.remote}/dev`,
        '--no-auto-snap --skip-dependency-installation --no-squash'
      );
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      mainBeforeDiverge = helper.scopeHelper.cloneWorkspace();

      helper.command.createLane();
      helper.command.deprecateComponent('comp1');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.getClonedWorkspace(mainBeforeDiverge);
      helper.command.deprecateComponent('comp1');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.undeprecateComponent('comp1');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.importLane('dev');
      helper.command.mergeLane('main', '--no-auto-snap --skip-dependency-installation');
      beforeConfigResolved = helper.scopeHelper.cloneWorkspace();
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
        helper.scopeHelper.getClonedWorkspace(beforeConfigResolved);
        helper.general.fixMergeConfigConflict('theirs');
      });
      it('should show the component as undeprecated', () => {
        const deprecationData = helper.command.showAspectConfig('comp1', Extensions.deprecation);
        expect(deprecationData.config.deprecate).to.be.false;
      });
    });
    describe('snapping the components', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(beforeConfigResolved);
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.dependenciesSet('comp1', 'lodash@3.3.1');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      mainBeforeDiverge = helper.scopeHelper.cloneWorkspace();

      helper.command.createLane();
      helper.command.deprecateComponent('comp1');
      helper.command.dependenciesSet('comp1', 'ramda@0.0.20', '--dev');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.getClonedWorkspace(mainBeforeDiverge);
      helper.command.deprecateComponent('comp1');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.undeprecateComponent('comp1');
      helper.command.dependenciesSet('comp1', 'ramda@0.0.21', '--dev');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.importLane('dev', '--skip-dependency-installation');
      beforeMerge = helper.scopeHelper.cloneWorkspace();
      helper.command.mergeLane('main', '--no-auto-snap --skip-dependency-installation');
      beforeConfigResolved = helper.scopeHelper.cloneWorkspace();
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
        helper.scopeHelper.getClonedWorkspace(beforeConfigResolved);
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
        helper.scopeHelper.getClonedWorkspace(beforeMerge);
        helper.command.mergeLane('main', '--no-auto-snap --skip-dependency-installation --auto-merge-resolve=ours');
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
        helper.scopeHelper.getClonedWorkspace(beforeMerge);
        helper.command.mergeLane('main', '--no-auto-snap --skip-dependency-installation --auto-merge-resolve=theirs');
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.dependenciesSet('comp1', 'lodash@3.3.1');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      mainBeforeDiverge = helper.scopeHelper.cloneWorkspace();

      helper.command.createLane();
      helper.command.dependenciesSet('comp1', 'ramda@0.0.20');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.getClonedWorkspace(mainBeforeDiverge);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();

      helper.command.mergeLane('dev', '--no-auto-snap -x --no-squash');
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile('comp1/index.js', `import R from 'ramda';`);
      helper.npm.addFakeNpmPackage('ramda', '0.0.19');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      mainBeforeDiverge = helper.scopeHelper.cloneWorkspace();

      helper.command.createLane();
      helper.npm.addFakeNpmPackage('ramda', '0.0.20');
      helper.workspaceJsonc.addPolicyToDependencyResolver({ dependencies: { ramda: '0.0.20' } });
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.getClonedWorkspace(mainBeforeDiverge);
      helper.npm.addFakeNpmPackage('ramda', '0.0.21');
      helper.workspaceJsonc.addPolicyToDependencyResolver({ dependencies: { ramda: '0.0.21' } });
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.importLane('dev', '--skip-dependency-installation');
      helper.command.mergeLane('main', '--no-auto-snap --skip-dependency-installation --ignore-config-changes');
      beforeConfigResolved = helper.scopeHelper.cloneWorkspace();
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
        helper.scopeHelper.getClonedWorkspace(beforeConfigResolved);
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
});
