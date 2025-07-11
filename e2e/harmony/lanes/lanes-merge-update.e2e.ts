import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('lanes merge and update operations', function () {
  this.timeout(0);
  let helper: Helper;

  before(() => {
    helper = new Helper();
  });

  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('tag on main, export, create lane and snap', () => {
    before(() => {
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
        helper.command.export();
        afterSwitchingLocal = helper.scopeHelper.cloneWorkspace();
        afterSwitchingRemote = helper.scopeHelper.cloneRemoteScope();
        helper.command.switchLocalLane('main', '-x');
      });
      it('status should not show the components as pending updates', () => {
        helper.command.expectStatusToBeClean();
      });

      describe('switch the lane back to dev', () => {
        before(() => {
          helper.command.switchLocalLane('dev', '-x');
        });
        describe('switch back to main', () => {
          before(() => {
            helper.command.switchLocalLane('main', '-x');
          });
          it('should not show the components as pending updates', () => {
            helper.command.expectStatusToBeClean();
          });
        });
      });

      describe('merging the dev lane when the lane is ahead (no diverge)', () => {
        before(() => {
          helper.command.mergeLane('dev', '-x');
        });
        it('should merge the lane successfully', () => {
          const status = helper.command.statusJson();
          expect(status.stagedComponents).to.have.lengthOf(2);
        });
        it('should not show the components as modified', () => {
          const status = helper.command.statusJson();
          expect(status.modifiedComponents).to.have.lengthOf(0);
        });
        describe('tagging the components', () => {
          before(() => {
            helper.command.tagAllWithoutBuild();
          });
          it('should tag successfully', () => {
            const status = helper.command.statusJson();
            expect(status.stagedComponents).to.have.lengthOf(2);
          });
        });
      });

      describe('merging the dev lane when the lane has diverged from main', () => {
        before(() => {
          helper.scopeHelper.getClonedWorkspace(afterSwitchingLocal);
          helper.scopeHelper.getClonedRemoteScope(afterSwitchingRemote);
          helper.command.switchLocalLane('main', '-x');
          helper.fixtures.populateComponents(2, undefined, 'v3');
          helper.command.snapAllComponentsWithoutBuild();
          helper.command.export();
          helper.command.mergeLane('dev', '-x');
        });
        it('should merge the lane successfully', () => {
          const status = helper.command.statusJson();
          expect(status.stagedComponents).to.have.lengthOf(2);
        });
        describe('tagging the components', () => {
          before(() => {
            helper.command.tagAllWithoutBuild();
          });
          it('should tag successfully', () => {
            const status = helper.command.statusJson();
            expect(status.stagedComponents).to.have.lengthOf(2);
          });
        });
      });
    });
  });

  describe('update components from remote lane', () => {
    let afterFirstExport: string;
    let remoteAfterSecondExport: string;
    let beforeSecondExport: string;
    let remoteBeforeSecondExport: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      afterFirstExport = helper.scopeHelper.cloneWorkspace();
      helper.fixtures.populateComponents(1, undefined, 'v2');
      helper.command.snapAllComponentsWithoutBuild();
      beforeSecondExport = helper.scopeHelper.cloneWorkspace();
      remoteBeforeSecondExport = helper.scopeHelper.cloneRemoteScope();
      helper.command.export();
      remoteAfterSecondExport = helper.scopeHelper.cloneRemoteScope();
    });

    describe('running "bit import" when the local is behind', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(afterFirstExport);
        helper.command.import();
      });
      it('bit import should not only bring the components but also merge the lane object', () => {
        const headOnLocalLane = helper.command.getHeadOfLane('dev', 'comp1');
        const headOnRemoteLane = helper.command.getHeadOfLane('dev', 'comp1', helper.scopes.remotePath);
        expect(headOnLocalLane).to.equal(headOnRemoteLane);
      });
      it('bit status should show the components as pending-updates', () => {
        const status = helper.command.statusJson();
        expect(status.outdatedComponents).to.have.lengthOf(1);
      });
      it('bit checkout head --all should update them all to the head version', () => {
        helper.command.checkoutHead('--all');
        helper.command.expectStatusToBeClean();
      });
    });

    describe('running "bit import" when the remote is behind', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(beforeSecondExport);
        helper.scopeHelper.getClonedRemoteScope(remoteBeforeSecondExport);
        helper.command.import();
      });
      it('bit import should not change the heads with the older snaps', () => {
        const headOnLocalLane = helper.command.getHeadOfLane('dev', 'comp1');
        const headOnRemoteLane = helper.command.getHeadOfLane('dev', 'comp1', helper.scopes.remotePath);
        expect(headOnLocalLane).to.not.equal(headOnRemoteLane);
      });
      it('bit status should still show the components as staged', () => {
        const status = helper.command.statusJson();
        expect(status.stagedComponents).to.have.lengthOf(1);
      });
    });

    describe('running "bit import" when the remote and the local have diverged', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(afterFirstExport);
        // it's imported, otherwise the auto-import brings the second snap from the remote
        helper.scopeHelper.getClonedRemoteScope(remoteBeforeSecondExport);
        helper.fixtures.populateComponents(1, undefined, 'v3');
        helper.command.snapAllComponentsWithoutBuild();
        helper.scopeHelper.getClonedRemoteScope(remoteAfterSecondExport);
        helper.command.import();
      });
      it('bit import should not change the heads with the older snaps', () => {
        const headOnLocalLane = helper.command.getHeadOfLane('dev', 'comp1');
        const headOnRemoteLane = helper.command.getHeadOfLane('dev', 'comp1', helper.scopes.remotePath);
        expect(headOnLocalLane).to.not.equal(headOnRemoteLane);
      });
      it('bit status should show the components as pending-merge', () => {
        const status = helper.command.statusJson();
        expect(status.mergePendingComponents).to.have.lengthOf(1);
      });
      it('bit merge with no args should merge them', () => {
        const output = helper.command.merge(`--manual`);
        expect(output).to.have.string('successfully merged');
        expect(output).to.have.string('CONFLICT');
      });
    });
  });

  describe('rename an exported lane', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('dev');
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.renameLane('new-lane');
    });
    it('should rename the lane locally', () => {
      const lanes = helper.command.listLanes();
      expect(lanes).to.have.string('new-lane');
      expect(lanes).to.not.have.string('dev');
    });
    it('should change the current lane', () => {
      const lanes = helper.command.listLanesParsed();
      expect(lanes.currentLane).to.equal('new-lane');
    });
    it('should not change the remote lane name before export', () => {
      const remoteLanes = helper.command.listRemoteLanesParsed();
      expect(remoteLanes.lanes).to.have.lengthOf(1);
      expect(remoteLanes.lanes[0].name).to.equal('dev');
    });
    it('should change the remote lane name after export', () => {
      helper.command.export();
      const remoteLanes = helper.command.listRemoteLanesParsed();
      expect(remoteLanes.lanes).to.have.lengthOf(1);
      expect(remoteLanes.lanes[0].name).to.equal('new-lane');
    });
  });

  describe('lane-a => lane-b', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(2, undefined, 'v2');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-b');
    });
    // previously, it was showing the components as staged, because it was comparing them to head, instead of
    // comparing them to lane-a.
    it('bit status should be clean', () => {
      helper.command.expectStatusToBeClean();
    });
    describe('lane-a (exported) => lane-b (not-exported) => lane-c', () => {
      before(() => {
        helper.command.createLane('lane-c');
      });
      it('forkedFrom should be of lane-a and not lane-b because this is the last exported one', () => {
        const lane = helper.command.catLane('lane-c');
        expect(lane.forkedFrom.name).to.equal('lane-a');
      });
    });
    describe('switching back to lane-a', () => {
      before(() => {
        helper.command.switchLocalLane('lane-a');
      });
      it('bitmap should show the lane as exported', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap['@teambit/legacy.bit-map'].exported).to.be.true;
      });
    });
  });
});
