import chai, { expect } from 'chai';
import { Helper, fixtures } from '@teambit/legacy.e2e-helper';
import { removeChalkCharacters } from '@teambit/legacy.utils';

chai.use(require('chai-fs'));

describe('bit lane command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('main => lane-a => lane-b, so laneB branched from laneA', () => {
    let beforeSwitchingBack;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      // main
      helper.fs.outputFile('utils/is-type/is-type.js', fixtures.isType);
      helper.command.addComponent('utils/is-type', { i: 'utils/is-type' });
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      // laneA
      helper.command.createLane('lane-a');
      helper.fs.outputFile(
        'utils/is-string/is-string.js',
        "const isType = require('../is-type/is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };"
      );
      helper.command.addComponent('utils/is-string', { i: 'utils/is-string' });
      helper.command.linkAndRewire();
      helper.command.compile();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      // laneB
      helper.command.createLane('lane-b');
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.snapAllComponentsWithoutBuild();

      beforeSwitchingBack = helper.scopeHelper.cloneWorkspace();
    });
    it('lane-a should not contain components from main', () => {
      const lane = helper.command.showOneLaneParsed('lane-a');
      expect(lane.components).to.have.lengthOf(1);
    });
    it('laneB object should include components from laneA, but not from main', () => {
      const lane = helper.command.showOneLaneParsed('lane-b');
      expect(lane.components).to.have.lengthOf(2);
    });
    it('bit list should show all components available to lane-b', () => {
      const list = helper.command.listLocalScopeParsed();
      expect(list).to.have.lengthOf(3);
    });
    describe('checking out to lane-a', () => {
      let switchOutput;
      before(() => {
        switchOutput = helper.command.switchLocalLane('lane-a');
      });
      it('should indicate that it switched to the new lane', () => {
        expect(switchOutput).to.have.string(
          removeChalkCharacters('successfully set "lane-a" as the active lane') as string
        );
      });
      // main components belong to lane-a only if they are snapped on lane-a, so utils/is-type
      // doesn't belong to lane-a and should not appear as staged when on lane-a.
      it('bit status should not show neither lane-b nor main components as staged', () => {
        const staged = helper.command.getStagedIdsFromStatus();
        expect(staged).to.have.lengthOf(0);
        const status = helper.command.status();
        expect(status).to.not.have.string('bar/foo');
      });
      it('bit list should not show lane-b components', () => {
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(2);
      });
      // @todo: test each one of the commands on bar/foo
    });
    describe('checking out from lane-b to main', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(beforeSwitchingBack);
        helper.command.switchLocalLane('main');
      });
      it('bit list should only show main components', () => {
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(1);
      });
      it('bit status should show only main components as staged', () => {
        const staged = helper.command.getStagedIdsFromStatus();
        expect(staged).to.have.lengthOf(0);
        const status = helper.command.status();
        expect(status).to.not.have.string('bar/foo');
        expect(status).to.not.have.string('utils/is-string');
      });
    });
    describe('switching to lane-a then to main', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(beforeSwitchingBack);
        helper.command.switchLocalLane('lane-a');
        helper.command.switchLocalLane('main');
      });
      it('bit list should only show main components', () => {
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(1);
      });
      it('bit status should show only main components as staged', () => {
        const staged = helper.command.getStagedIdsFromStatus();
        expect(staged).to.have.lengthOf(0);
        const status = helper.command.status();
        expect(status).to.not.have.string('bar/foo');
        expect(status).to.not.have.string('utils/is-string');
      });
    });
  });
  describe('creating lane-b from lane-a when lane-a is out-of-date', () => {
    let outOfDateState: string;
    let firstSnap: string;
    let secondSnap: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
      firstSnap = helper.command.getHeadOfLane('lane-a', 'comp1');
      helper.command.export();
      outOfDateState = helper.scopeHelper.cloneWorkspace();

      helper.fixtures.populateComponents(1, false, 'v2');
      helper.command.snapAllComponentsWithoutBuild();
      secondSnap = helper.command.getHeadOfLane('lane-a', 'comp1');
      helper.command.export();

      helper.scopeHelper.getClonedWorkspace(outOfDateState);
      helper.command.import();
      // intermediate step to make sure the lane is out-of-date
      const status = helper.command.statusJson();
      expect(status.outdatedComponents).to.have.lengthOf(1);

      helper.command.createLane('lane-b');
    });
    it('should add the component from the current/first snap (from .bitmap) and not from the head (lane-a object)', () => {
      const headOnLaneB = helper.command.getHeadOfLane('lane-b', 'comp1');
      expect(headOnLaneB).to.equal(firstSnap);
      expect(headOnLaneB).to.not.equal(secondSnap);
    });
  });
  describe('creating a lane from a lane when it has staged components', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.fixtures.populateComponents(1, false, 'v2');
      helper.command.snapAllComponentsWithoutBuild();
    });
    it('bit create should throw an error suggesting to export or reset first', () => {
      const output = helper.general.runWithTryCatch('bit lane create lane-b');
      expect(output).to.have.string('please export or reset the following components first');
    });
  });
  describe("fork a lane when the default-scope is different than the original lane's scope", () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.workspaceJsonc.addDefaultScope('some-scope');
      helper.command.createLane('lane-b');
    });
    it('should set the scope-name to be the same as the original lane', () => {
      const laneShow = helper.command.showOneLaneParsed('lane-b');
      expect(laneShow.id.scope).to.equal(helper.scopes.remote);
    });
  });
});
