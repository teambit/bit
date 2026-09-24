import chai, { expect } from 'chai';
import { InvalidScopeName } from '@teambit/legacy-bit-id';
import { LANE_KEY } from '@teambit/legacy.bit-map';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

describe('bit lane management', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  // created with an alias: the rename has to replace tracking data keyed by the alias, not the lane
  // name. (a rename of a lane without an alias is covered by rename-lane.e2e.ts)
  describe('rename an exported lane that has an alias', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('dev', '--alias d');
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
    it('bit status should not throw', () => {
      expect(() => helper.command.status()).to.not.throw();
    });
    // asserted on the file itself, not only through the CLI. kept before the export below, which
    // this describe performs inside an it
    it('should update .bitmap with the new name', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap[LANE_KEY].id.name).to.equal('new-lane');
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

  // a snapped-but-not-yet-exported lane. change-scope is still allowed at this point, so the
  // invalid-name check runs here; the exported case (where change-scope is blocked outright)
  // follows in a nested describe that does the export itself.
  describe('a new lane with a snapped component', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane();
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
    });

    it('bit lane --details should show the lanes, mark the current one and list its components', () => {
      const output = helper.command.listLanes('--details');
      expect(output).to.have.string(`current lane - ${helper.scopes.remote}/dev`);
      expect(output).to.have.string('comp1');
    });

    it('change-scope should throw InvalidScopeName for an invalid scope-name', () => {
      const err = new InvalidScopeName('invalid.scope.name');
      const cmd = () => helper.command.changeLaneScope('invalid.scope.name');
      helper.general.expectToThrow(cmd, err);
    });

    describe('once the lane is exported', () => {
      before(() => {
        helper.command.export();
      });
      it('change-scope should be blocked', () => {
        expect(() => helper.command.changeLaneScope('new-scope')).to.throw(
          'changing lane scope-name is allowed for new lanes only'
        );
      });
    });
  });
});
