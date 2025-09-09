import chai, { expect } from 'chai';
import { DEFAULT_LANE } from '@teambit/lane-id';
import { IS_WINDOWS } from '@teambit/legacy.constants';
import { Helper } from '@teambit/legacy.e2e-helper';
import { LaneNotFound } from '@teambit/legacy.scope-api';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

describe('remove lanes', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('switching to a new lane and snapping', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents();
      helper.command.snapAllComponents();
      helper.command.export();

      helper.command.createLane();
      helper.command.snapComponent(`comp1 --unmodified`);
    });
    it('as an intermediate step, make sure the snapped components are part of the lane', () => {
      const lane = helper.command.showOneLaneParsed('dev');
      expect(lane.components).to.have.lengthOf(1);
    });
    it('should not alow removing the current lane', () => {
      const output = helper.general.runWithTryCatch('bit lane remove dev -s');
      expect(output).to.have.string('unable to remove the currently used lane');
    });
    it('should not alow removing the default lane', () => {
      const output = helper.general.runWithTryCatch(`bit lane remove ${DEFAULT_LANE} -s`);
      expect(output).to.have.string('unable to remove the default lane');
    });
    describe('switching back to default lane', () => {
      let beforeRemove;
      before(() => {
        helper.command.switchLocalLane(DEFAULT_LANE);
        beforeRemove = helper.scopeHelper.cloneWorkspace(IS_WINDOWS);
      });
      describe('then removing without --force flag', () => {
        let output;
        before(() => {
          output = helper.general.runWithTryCatch('bit lane remove dev -s');
        });
        it('should throw an error saying it is not fully merged', () => {
          expect(output).to.have.string('unable to remove dev lane, it is not fully merged');
        });
      });
      describe('then removing with --force flag', () => {
        let output;
        before(() => {
          output = helper.command.removeLane('dev --force');
        });
        it('should remove the lane successfully', () => {
          expect(output).to.have.string('successfully removed the following lane(s)');
        });
        it('bit lane should not show the lane anymore', () => {
          const lanes = helper.command.listLanes();
          expect(lanes).not.to.have.string('dev');
        });
      });
      describe('removing with --force flag and the full id', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedWorkspace(beforeRemove);
          output = helper.command.removeLane(`${helper.scopes.remote}/dev --force`);
        });
        it('should remove the lane successfully', () => {
          expect(output).to.have.string('successfully removed the following lane(s)');
        });
      });
      describe('merge the lane, then remove without --force', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedWorkspace(beforeRemove);
          helper.command.mergeLane('dev');
          output = helper.command.removeLane('dev');
        });
        it('should remove the lane successfully', () => {
          expect(output).to.have.string('successfully removed the following lane(s)');
        });
      });
    });
  });
  describe('removing a remote lane', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane();
      helper.fixtures.populateComponents();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
    });
    it('as an intermediate step, make sure the lane is on the remote', () => {
      const lanes = helper.command.listRemoteLanesParsed();
      expect(lanes.lanes).to.have.lengthOf(1);
    });
    it('should not remove without --force flag as the lane is not merged', () => {
      const output = helper.general.runWithTryCatch(`bit lane remove ${helper.scopes.remote}/dev --remote --silent`);
      expect(output).to.have.string('unable to remove dev lane, it is not fully merged');
    });
    describe('remove with --force flag', () => {
      let output;
      before(() => {
        output = helper.command.removeRemoteLane('dev', '--force');
      });
      it('should remove successfully', () => {
        expect(output).to.have.string('successfully removed');
      });
      it('the remote should not have the lane anymore', () => {
        const lanes = helper.command.listRemoteLanesParsed();
        expect(lanes.lanes).to.have.lengthOf(0);
      });
      // this has been changed to support the ability to restore a deleted lane.
      // it's ok that the model-components objects are there. it doesn't harm.
      it.skip('the remote should not have the components anymore as they dont belong to any lane', () => {
        const remoteComps = helper.command.catScope(undefined, helper.scopes.remotePath);
        expect(remoteComps).to.have.lengthOf(0);
      });
      describe('removing again after the lane was removed', () => {
        it('should indicate that the lane was not found', () => {
          const err = new LaneNotFound(helper.scopes.remote, `${helper.scopes.remote}/dev`);
          const cmd = () =>
            helper.command.runCmd(`bit lane remove ${helper.scopes.remote}/dev --remote --silent --force`);
          // this is to make sure it doesn't show an error about indexJson having the component but missing from the scope
          helper.general.expectToThrow(cmd, err);
        });
      });
    });
  });
});
