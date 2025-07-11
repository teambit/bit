import chai, { expect } from 'chai';
import { LANE_KEY } from '@teambit/legacy.bit-map';
import { removeChalkCharacters } from '@teambit/legacy.utils';
import { Helper } from '@teambit/legacy.e2e-helper';
import { LANE_REMOTE_DELIMITER } from '@teambit/lane-id';

chai.use(require('chai-fs'));

describe('bit lane basic operations', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('creating a new lane without any component', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitWorkspace({ addRemoteScopeAsDefaultScope: false });
      helper.command.createLane();
      output = helper.command.listLanes();
    });
    it('bit lane should show the active lane', () => {
      expect(output).to.have.string(`current lane - my-scope/dev`);
      expect(output).to.have.string('main');
    });
  });

  describe('default tracking data', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.command.createLane();
    });
    it('should set the remote-scope to the default-scope and remote-name to the local-lane', () => {
      const laneData = helper.command.showOneLane('dev');
      expect(laneData).to.have.string(`${helper.scopes.remote}${LANE_REMOTE_DELIMITER}dev`);
    });
  });

  describe('change tracking data', () => {
    let output: string;
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.command.createLane();
      output = helper.command.changeLaneScope('my-remote');
    });
    it('should output the changes', () => {
      expect(removeChalkCharacters(output)).to.have.string(
        `the remote-scope of dev has been changed from ${helper.scopes.remote} to my-remote`
      );
    });
    it('bit lane show should show the changed values', () => {
      const laneData = helper.command.showOneLane('dev');
      expect(laneData).to.have.string(`my-remote${LANE_REMOTE_DELIMITER}dev`);
    });
  });

  describe('main => lane => main => lane', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.switchLocalLane('main');
    });
    // previously it errored with "error: version "latest" of component comp1 was not found."
    it('should be able to switch back to the lane with no error', () => {
      expect(() => helper.command.switchLocalLane('dev')).to.not.throw();
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
        expect(bitMap[LANE_KEY].exported).to.be.true;
      });
    });
  });

  describe('creating components on lanes, that do not exist on main', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('dev');
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
    });
    it('should add "onLanesOnly" prop', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap.comp1.onLanesOnly).to.be.true;
    });
  });

  describe('creating a new lane to a different scope than main', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
    });
    it('should not throw even when --fork-lane-new-scope was not used', () => {
      expect(() => helper.command.createLane('dev', '--scope some-scope')).to.not.throw();
    });
  });
});
