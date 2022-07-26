import chai, { expect } from 'chai';
import path from 'path';
import { statusWorkspaceIsCleanMsg } from '../../../src/constants';
import { LANE_KEY } from '../../../src/consumer/bit-map/bit-map';
import Helper from '../../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../../src/fixtures/fixtures';

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
  describe('switching lanes', () => {
    describe('importing the lane objects and switching to that lane', () => {
      let beforeLaneSwitch;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
        helper.bitJsonc.setupDefault();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFooAsDir();
        helper.command.snapAllComponents();
        helper.command.createLane();
        helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
        helper.command.snapAllComponents();
        helper.command.exportLane();

        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.addRemoteScope();
        beforeLaneSwitch = helper.scopeHelper.cloneLocalScope();
        helper.command.switchRemoteLane('dev');
      });
      it('should write the component to the filesystem with the same version as the lane', () => {
        const fileContent = helper.fs.readFile(`${helper.scopes.remote}/bar/foo/foo.js`);
        expect(fileContent).to.equal(fixtures.fooFixtureV2);
      });
      it('.bitmap should save the remote lane', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap[LANE_KEY].id).to.deep.equal({ name: 'dev', scope: helper.scopes.remote });
      });
      it('bit lane should show the component in the checked out lane', () => {
        const lanes = helper.command.showOneLaneParsed('dev');
        expect(lanes.components).to.have.lengthOf(1);
        expect(lanes.components[0].id.name).to.equal('bar/foo');
      });
      it('bit status should not show the component as pending updates', () => {
        const status = helper.command.statusJson();
        expect(status.outdatedComponents).to.have.lengthOf(0);
      });
      it('bit status should show clean state', () => {
        const output = helper.command.runCmd('bit status');
        expect(output).to.have.string(statusWorkspaceIsCleanMsg);
      });
      it('bit lane should show the checked out lane as the active one', () => {
        const lanes = helper.command.listLanesParsed();
        expect(lanes.currentLane).to.equal('dev');
      });
      describe('changing the component and running bit diff', () => {
        let diff;
        before(() => {
          helper.fs.outputFile(`${helper.scopes.remote}/bar/foo/foo.js`, fixtures.fooFixtureV3);
          diff = helper.command.diff();
        });
        it('should show the diff between the filesystem and the lane', () => {
          expect(diff).to.have.string("-module.exports = function foo() { return 'got foo v2'; }");
          expect(diff).to.have.string("+module.exports = function foo() { return 'got foo v3'; }");
        });
        it('should not show the diff between the filesystem and main', () => {
          expect(diff).to.not.have.string("-module.exports = function foo() { return 'got foo'; }");
        });
      });
      describe("snapping the component (so, it's an imported lane with local snaps)", () => {
        before(() => {
          helper.fs.outputFile(`${helper.scopes.remote}/bar/foo/foo.js`, fixtures.fooFixtureV3);
          helper.command.snapAllComponents();
        });
        it('bit status should show the component as staged', () => {
          const status = helper.command.statusJson();
          expect(status.stagedComponents).to.have.lengthOf(1);
        });
        it('bit status --verbose should show the staged hash', () => {
          const status = helper.command.status('--verbose');
          const localSnap = helper.command.getHeadOfLane('dev', 'bar/foo');
          expect(status).to.have.string(localSnap);
        });
      });
      describe('switching with a different lane name', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(beforeLaneSwitch);
          helper.command.switchRemoteLane('dev', '--alias my-new-lane');
        });
        it('should save the remote-lane data into a local with the specified name', () => {
          const lanes = helper.command.showOneLaneParsed('my-new-lane');
          expect(lanes.components).to.have.lengthOf(1);
        });
        it('should be able to retrieve the lane using the remote-name', () => {
          const lanes = helper.command.showOneLaneParsed('dev');
          expect(lanes.components).to.have.lengthOf(1);
        });
      });
      describe('switching to a local lane', () => {
        before(() => {
          helper.command.createLane('int');
          helper.command.switchLocalLane('main');
          helper.command.switchLocalLane('int');
        });
        it('should switch successfully', () => {
          helper.command.expectCurrentLaneToBe('int');
        });
        it('should not save the local lane in bitmap', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap[LANE_KEY]).to.not.deep.equal({ name: 'int', scope: helper.scopes.remote });
        });
        it('should not throw an error on bit install', () => {
          expect(() => helper.command.install()).not.to.throw();
        });
      });
    });
  });
  describe('switching lanes with deleted files', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.createLane('migration');
      helper.fs.outputFile('comp1/comp1.spec.js');
      helper.command.addComponent('comp1/');
      helper.command.install();
      helper.command.compile();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.switchLocalLane('main');
    });
    it('should delete the comp1/comp1.spec.js file', () => {
      expect(path.join(helper.scopes.localPath, 'comp1/comp1.spec.js')).to.not.be.a.path();
    });
  });
  describe('switching lanes and importing in a new scope from remote scope', () => {
    let mainScope;
    let laneScope;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();

      mainScope = helper.scopeHelper.cloneLocalScope();
      helper.command.createLane('dev');
      laneScope = helper.scopeHelper.cloneLocalScope();

      helper.command.switchLocalLane('main');
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile('comp2/index.js');
      helper.command.addComponent('comp2/');
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.command.switchLocalLane('dev');
      helper.fs.outputFile('comp1/comp.model.js');
      helper.fs.outputFile('comp2/comp.model.js');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
    });
    it('should import the latest from main when on main', () => {
      helper.scopeHelper.getClonedLocalScope(mainScope);
      helper.command.import(`${helper.scopes.remote}/*`);
      const result = helper.command.listParsed();
      expect(result).to.have.lengthOf(2);
      expect(result[0].currentVersion).to.have.string('0.0.1');
      expect(result[1].currentVersion).to.have.string('0.0.1');
    });
    it('should only import comp2 from the lane when on a lane', () => {
      helper.scopeHelper.getClonedLocalScope(laneScope);
      helper.command.importComponent('comp2');
      const result = helper.command.listParsed();
      expect(result).to.have.lengthOf(1);
      expect(result[0].id).to.have.string('comp2');
      expect(result[0].currentVersion).to.not.have.string('0.0.1');
    });
    it('should only import comp1 from the lane when on a lane', () => {
      helper.scopeHelper.getClonedLocalScope(laneScope);
      helper.command.importComponent('comp1');
      const result = helper.command.listParsed();
      expect(result).to.have.lengthOf(1);
      expect(result[0].id).to.have.string('comp1');
      expect(result[0].currentVersion).to.not.have.string('0.0.1');
    });
  });
  describe('switch to main after importing a lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild(); // main has 0.0.1
      helper.command.export();

      helper.command.createLane();
      helper.fixtures.populateComponents(1, undefined, 'v2');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.bitJsonc.setupDefault();
      helper.command.importComponent('comp1');
      helper.command.switchRemoteLane('dev');
      helper.command.switchLocalLane('main');
    });
    // a previous bug was saving the hash from the lane in the bitmap file
    it('.bitmap should have the component with the main version', () => {
      const bitmap = helper.bitMap.read();
      expect(bitmap.comp1.version).to.equal('0.0.1');
    });
    it('should list the component as 0.0.1 and not with a hash', () => {
      const list = helper.command.listParsed();
      expect(list[0].localVersion).to.equal('0.0.1');
      expect(list[0].currentVersion).to.equal('0.0.1');
    });
  });
});
