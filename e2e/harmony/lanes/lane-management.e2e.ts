import chai, { expect } from 'chai';
import { InvalidScopeName } from '@teambit/legacy-bit-id';
import { Helper, fixtures } from '@teambit/legacy.e2e-helper';
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

  describe('change-scope', () => {
    describe('when the lane is exported', () => {
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.command.createLane();
        helper.fixtures.populateComponents(1, false);
        helper.command.snapAllComponentsWithoutBuild();
        helper.command.export();
      });
      it('should block the rename', () => {
        expect(() => helper.command.changeLaneScope('new-scope')).to.throw(
          'changing lane scope-name is allowed for new lanes only'
        );
      });
    });
    describe('when the scope-name is invalid', () => {
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.command.createLane();
        helper.fixtures.populateComponents(1, false);
      });
      it('should throw InvalidScopeName error', () => {
        const err = new InvalidScopeName('invalid.scope.name');
        const cmd = () => helper.command.changeLaneScope('invalid.scope.name');
        helper.general.expectToThrow(cmd, err);
      });
    });
  });

  describe('bit lane with --details flag', () => {
    let output: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      helper.command.snapAllComponentsWithoutBuild();
      output = helper.command.listLanes('--details');
    });
    it('should show all lanes and mark the current one', () => {
      expect(output).to.have.string(`current lane - ${helper.scopes.remote}/dev`);
    });
  });
});
