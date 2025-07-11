import chai, { expect } from 'chai';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('bit lane command part 3', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('import with dependencies as packages', () => {
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCiInPackageJsonHarmony();
      await npmCiRegistry.init();
      helper.command.tagAllComponents();
      helper.command.export();
      helper.scopeHelper.reInitWorkspace();
      npmCiRegistry.setResolver();
      helper.command.importComponent('comp1');
    });
    after(() => {
      npmCiRegistry.destroy();
    });
    describe('switching to a new lane', () => {
      before(() => {
        helper.command.createLane();
      });
      it('should not show all components are staged', () => {
        helper.command.expectStatusToBeClean();
      });
    });
  });
  describe('tag on main, export, create lane and snap', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.populateComponents(2, undefined, 'v2');
      helper.command.snapAllComponentsWithoutBuild();
    });
    it('bit status should show the correct staged versions', () => {
      // before it was a bug that "versions" part of the staged-component was empty
      // another bug was that it had all versions included exported.
      const status = helper.command.status('--verbose');
      const hash = helper.command.getHeadOfLane('dev', 'comp1');
      expect(status).to.have.string(`versions: ${hash} ...`);
    });
    describe('export the lane, then switch back to main', () => {
      let afterSwitchingLocal: string;
      let afterSwitchingRemote: string;
      before(() => {
        helper.command.exportLane();
        helper.command.switchLocalLane('main');
        afterSwitchingLocal = helper.scopeHelper.cloneWorkspace();
        afterSwitchingRemote = helper.scopeHelper.cloneRemoteScope();
      });
      it('status should not show the components as pending updates', () => {
        helper.command.expectStatusToBeClean();
      });
      describe('switch the lane back to dev', () => {
        before(() => {
          helper.command.switchLocalLane('dev');
        });
        it('should change the version prop in .bitmap', () => {
          const bitMap = helper.bitMap.read();
          const head = helper.command.getHeadOfLane('dev', 'comp1');
          expect(bitMap.comp1.version).to.equal(head);
        });
        describe('switch back to main', () => {
          before(() => {
            helper.command.switchLocalLane('main');
          });
          it('should change the version prop in .bitmap', () => {
            const bitMap = helper.bitMap.read();
            expect(bitMap.comp1.version).to.equal('0.0.1');
          });
          it('status should not show the components as pending updates', () => {
            helper.command.expectStatusToBeClean();
          });
        });
      });
      describe('merging the dev lane when the lane is ahead (no diverge)', () => {
        before(() => {
          helper.scopeHelper.getClonedWorkspace(afterSwitchingLocal);
          helper.command.mergeLane('dev');
        });
        it('should merge the lane', () => {
          const mergedLanes = helper.command.listLanes('--merged');
          expect(mergedLanes).to.include('dev');
        });
        it('should show the merged components as staged', () => {
          const status = helper.command.statusJson();
          expect(status.stagedComponents).to.have.lengthOf(2);
        });
        it('bit import should not reset the component to the remote-state but should keep the merged data', () => {
          helper.command.import();
          const status = helper.command.statusJson();
          expect(status.outdatedComponents).to.have.lengthOf(0);
          expect(status.stagedComponents).to.have.lengthOf(2);
        });
        describe('tagging the components', () => {
          before(() => {
            helper.command.tagIncludeUnmodified();
          });
          it('should be able to export with no errors', () => {
            expect(() => helper.command.export()).not.to.throw();
          });
        });
      });
      describe('merging the dev lane when the lane has diverged from main', () => {
        before(() => {
          helper.scopeHelper.getClonedWorkspace(afterSwitchingLocal);
          helper.scopeHelper.getClonedRemoteScope(afterSwitchingRemote);
          helper.fixtures.populateComponents(2, undefined, 'v3');
          helper.command.snapAllComponentsWithoutBuild();
          helper.command.mergeLane('dev', '--auto-merge-resolve ours --no-squash');
        });
        it('should merge the lane', () => {
          const mergedLanes = helper.command.listLanes('--merged');
          expect(mergedLanes).to.include('dev');
        });
        it('should show the merged components as staged', () => {
          const status = helper.command.statusJson();
          expect(status.stagedComponents).to.have.lengthOf(2);
        });
        describe('tagging the components', () => {
          before(() => {
            helper.command.tagIncludeUnmodified();
          });
          it('should be able to export with no errors', () => {
            expect(() => helper.command.export()).not.to.throw();
          });
        });
      });
    });
  });
});
