import { IssuesClasses } from '@teambit/component-issues';
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
        helper.fs.outputFile(`${helper.scopes.remote}/comp1/index.js`);
        helper.fs.outputFile(`${helper.scopes.remote}/comp2/index.js`);
        helper.fs.outputFile(`${helper.scopes.remote}/comp3/index.js`);
      });
      it('should keep the configuration from the lane', () => {
        const deprecationData = helper.command.showAspectConfig('comp1', Extensions.deprecation);
        expect(deprecationData.config.deprecate).to.be.true;
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
  describe('diverge with different config', () => {
    let mainBeforeDiverge: string;
    let beforeConfigResolved: string;
    before(() => {
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
});
