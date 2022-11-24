import chai, { expect } from 'chai';
import { DEFAULT_LANE } from '@teambit/lane-id';
import { IS_WINDOWS } from '../../../src/constants';
import Helper from '../../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

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
      helper.scopeHelper.setNewLocalAndRemoteScopesWithDefault();
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
        beforeRemove = helper.scopeHelper.cloneLocalScope(IS_WINDOWS);
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
      describe('merge the lane, then remove without --force', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(beforeRemove);
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
      helper.scopeHelper.setNewLocalAndRemoteScopesWithDefault();
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
      it('the remote should not have the components anymore as they dont belong to any lane', () => {
        const remoteComps = helper.command.catScope(undefined, helper.scopes.remotePath);
        expect(remoteComps).to.have.lengthOf(0);
      });
      describe('removing again after the lane was removed', () => {
        let removeOutput;
        before(() => {
          removeOutput = helper.general.runWithTryCatch(
            `bit lane remove ${helper.scopes.remote}/dev --remote --silent --force`
          );
        });
        it('should indicate that the lane was not found', () => {
          // this is to make sure it doesn't show an error about indexJson having the component but missing from the scope
          expect(removeOutput).to.have.string('lane "dev" was not found in scope');
        });
      });
    });
  });
});
