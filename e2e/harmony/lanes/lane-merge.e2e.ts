import chai, { expect } from 'chai';
import { Helper, fixtures } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('bit lane merge operations', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('export the lane, then switch back to main', () => {
    let afterSwitchingLocal: string;
    let afterSwitchingRemote: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.populateComponents(2, undefined, 'v2');
      helper.command.snapAllComponentsWithoutBuild();
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

  describe('branching out when a component is checked out to an older version', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagWithoutBuild();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      helper.command.tagWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo@0.0.1');

      helper.command.createLane();
      helper.fs.outputFile(`${helper.scopes.remote}/bar/foo/foo.js`, fixtures.fooFixtureV3);
      helper.command.snapAllComponentsWithoutBuild();

      helper.command.switchLocalLane('main');
    });
    it('should checkout to the head of the origin branch', () => {
      helper.bitMap.expectToHaveId('bar/foo', '0.0.2');
    });
    it('bit status should be clean', () => {
      helper.command.expectStatusToBeClean();
    });
    // previously, the behavior was to checkout to the same version it had before
    it.skip('should checkout to the same version the origin branch had before the switch', () => {
      helper.bitMap.expectToHaveId('bar/foo', '0.0.1');
    });
    // previously, the behavior was to checkout to the same version it had before
    it.skip('bit status should not show the component as modified only as pending update', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponents).to.have.lengthOf(0);
      expect(status.outdatedComponents).to.have.lengthOf(1);
      expect(status.importPendingComponents).to.have.lengthOf(0);
      expect(status.stagedComponents).to.have.lengthOf(0);
      expect(status.invalidComponents).to.have.lengthOf(0);
      expect(status.newComponents).to.have.lengthOf(0);
    });
  });

  describe('head on the lane is not in the filesystem', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane();
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.fs.deletePath('.bit');
      helper.command.init();
      helper.scopeHelper.addRemoteScope();
    });
    it('bit status should not throw', () => {
      expect(() => helper.command.status()).not.to.throw();
    });
  });
});
