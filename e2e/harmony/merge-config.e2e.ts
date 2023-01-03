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
      describe('snapping the components', () => {
        before(() => {
          helper.command.install();
          helper.command.compile();
          helper.command.snapAllComponentsWithoutBuild();
        });
        it('should not save it with force: true in the model after snapping', () => {
          const cmp = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`);
          const depResolver = cmp.extensions.find((e) => e.name === Extensions.dependencyResolver);
          const policy = depResolver.data.policy;
          const comp2 = policy.find((p) => p.dependencyId === `${helper.general.getPackageNameByCompName('comp2')}`);
          expect(comp2.force).to.equal(false);
        });
      });
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
      const configPath = helper.general.getConfigMergePath('comp1');
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
        helper.general.fixMergeConfigConflict('ours', 'comp1');
      });
      it('should show the component deprecated', () => {
        const deprecationData = helper.command.showAspectConfig('comp1', Extensions.deprecation);
        expect(deprecationData.config.deprecate).to.be.true;
      });
    });
    describe('fixing the conflict with theirs', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeConfigResolved);
        helper.general.fixMergeConfigConflict('theirs', 'comp1');
      });
      it('should show the component as undeprecated', () => {
        const deprecationData = helper.command.showAspectConfig('comp1', Extensions.deprecation);
        expect(deprecationData.config.deprecate).to.be.false;
      });
    });
    describe('snapping the components', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeConfigResolved);
        helper.general.fixMergeConfigConflict('theirs', 'comp1');
        helper.command.snapAllComponentsWithoutBuild();
      });
      it('should delete the config-merge file', () => {
        const configMergePath = helper.general.getConfigMergePath('comp1');
        expect(configMergePath).to.not.be.a.path();
      });
    });
  });
  describe('diverge with different dependencies config', () => {
    let mainBeforeDiverge: string;
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
      helper.command.mergeLane('main', '--no-snap --skip-dependency-installation');
      beforeConfigResolved = helper.scopeHelper.cloneLocalScope();
    });
    it('bit status should show the component with an issue of MergeConfigHasConflict', () => {
      helper.command.expectStatusToHaveIssue(IssuesClasses.MergeConfigHasConflict.name);
    });
    describe('fixing the conflict with ours', () => {
      before(() => {
        helper.general.fixMergeConfigConflict('ours', 'comp1');
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
        helper.general.fixMergeConfigConflict('theirs', 'comp1');
      });
      it('should show the dev-dependency as it was set on main', () => {
        const showConfig = helper.command.showAspectConfig('comp1', Extensions.dependencyResolver);
        const ramdaDep = showConfig.data.dependencies.find((d) => d.id === 'ramda');
        expect(ramdaDep.version).to.equal('0.0.21');
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
      const conflictFile = helper.general.getConfigMergePath('comp1');
      const conflictFileContent = fs.readFileSync(conflictFile).toString();
      expect(conflictFileContent).to.have.string(Extensions.envs);
      expect(conflictFileContent).to.not.have.string(Extensions.dependencyResolver);
    });
    describe('fixing the conflict with ours', () => {
      before(() => {
        helper.general.fixMergeConfigConflict('ours', 'comp1');
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
        helper.general.fixMergeConfigConflict('theirs', 'comp1');
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
});
