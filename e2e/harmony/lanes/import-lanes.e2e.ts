import { DEFAULT_LANE } from '@teambit/lane-id';
import chai, { expect } from 'chai';
import path from 'path';
import { statusWorkspaceIsCleanMsg } from '../../../src/constants';
import { LANE_KEY } from '../../../src/consumer/bit-map/bit-map';
import Helper from '../../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../../src/fixtures/fixtures';

chai.use(require('chai-fs'));

describe('import lanes', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('importing lanes', () => {
    let appOutput: string;
    let laneHash: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.bitJsonc.setupDefault();
      appOutput = helper.fixtures.populateComponents();
      helper.command.createLane('dev');
      helper.command.snapAllComponents();
      helper.command.exportLane();

      const laneObj = helper.command.catLane('dev');
      laneHash = laneObj.hash;
    });
    describe('fetching lanes objects', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.fetchRemoteLane('dev');
      });
      it('should not write the components to the filesystem', () => {
        expect(path.join(helper.scopes.localPath, 'components/bar/foo')).to.not.be.a.path();
      });
      it('bitmap should be empty', () => {
        const bitMap = helper.bitMap.readComponentsMapOnly();
        expect(Object.keys(bitMap)).to.have.lengthOf(0);
      });
      it('should import components objects on that lane', () => {
        const list = helper.command.listLocalScopeParsed('--scope');
        expect(list).to.have.lengthOf(3);
      });
      it('bit status should show a clean state', () => {
        const output = helper.command.runCmd('bit status');
        expect(output).to.have.string(statusWorkspaceIsCleanMsg);
      });
      // before, it was throwing "lane main was not found in scope" error
      it('bit fetch with no args should not throw errors', () => {
        expect(() => helper.command.fetchAllLanes()).to.not.throw();
      });
    });
    describe('importing the lane and checking out by bit switch', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.switchRemoteLane('dev');
      });
      it('should write the components to the filesystem', () => {
        helper.fs.outputFile('app.js', fixtures.appPrintComp1(helper.scopes.remote));
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal(appOutput);
      });
      it('.bitmap should save the remote lane', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap[LANE_KEY].id).to.deep.equal({ name: 'dev', scope: helper.scopes.remote });
        expect(bitMap[LANE_KEY].exported).to.be.true;
      });
      it('bit lane should show the component in the checked out lane', () => {
        const lanes = helper.command.showOneLaneParsed('dev');
        expect(lanes.components).to.have.lengthOf(3);
      });
      it('bit status should show clean state', () => {
        const output = helper.command.runCmd('bit status');
        expect(output).to.have.string(statusWorkspaceIsCleanMsg);
      });
      it('bit lane should show the checked out lane as the active one', () => {
        const lanes = helper.command.listLanes();
        expect(lanes).to.have.string('current lane - dev');
      });
      it('.bitmap should save the component as belong to the lane', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.comp1.onLanesOnly).to.be.true;
        expect(bitMap.comp2.onLanesOnly).to.be.true;
      });
      it('should save the lane object with the same hash as the original lane', () => {
        const laneObj = helper.command.catLane('dev');
        expect(laneObj.hash).to.eq(laneHash);
      });
      describe('switching to main', () => {
        before(() => {
          helper.command.switchLocalLane('main');
        });
        it('should remove the lane key from the .bitmap', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap).to.not.have.property(LANE_KEY);
        });
        it('should switch successfully', () => {
          helper.command.expectCurrentLaneToBe(DEFAULT_LANE);
        });
      });
    });
    describe('importing the lane and checking out with a different local lane-name', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.switchRemoteLane('dev', '--alias my-new-lane');
      });
      it('bit lane should show the component in the checked out lane', () => {
        const lane = helper.command.showOneLaneParsed('my-new-lane');
        expect(lane.components).to.have.lengthOf(3);
      });
      it('bit lane should show the checked out lane as the active one', () => {
        const lanes = helper.command.listLanesParsed();
        expect(lanes.currentLane).to.equal('my-new-lane');
      });
      it('should write the components to the filesystem', () => {
        helper.fs.outputFile('app.js', fixtures.appPrintComp1(helper.scopes.remote));
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal(appOutput);
      });
      it('.bitmap should save the remote lane', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap[LANE_KEY].id).to.deep.equal({ name: 'dev', scope: helper.scopes.remote });
        expect(bitMap[LANE_KEY].exported).to.be.true;
      });
    });
  });
});
