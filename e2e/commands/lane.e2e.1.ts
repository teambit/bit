import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';

import { AUTO_SNAPPED_MSG } from '../../src/cli/commands/public-cmds/snap-cmd';
import { statusWorkspaceIsCleanMsg } from '../../src/cli/commands/public-cmds/status-cmd';
import { DEFAULT_LANE, IS_WINDOWS, LANE_REMOTE_DELIMITER } from '../../src/constants';
import { LANE_KEY } from '../../src/consumer/bit-map/bit-map';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';
import { removeChalkCharacters } from '../../src/utils';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

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
  describe('creating a new lane without any component', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.command.createLane();
      output = helper.command.showLanes();
    });
    it('bit lane should show the active lane', () => {
      expect(output).to.have.string('current lane - dev');
    });
  });
  describe('create a snap on main then on a new lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.snapAllComponents();
      helper.command.createLane();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      helper.command.snapAllComponents();
    });
    it('bit status should show the component only once as staged', () => {
      const status = helper.command.statusJson();
      expect(status.stagedComponents).to.have.lengthOf(1);
      expect(status.importPendingComponents).to.have.lengthOf(0);
      expect(status.invalidComponents).to.have.lengthOf(0);
      expect(status.modifiedComponent).to.have.lengthOf(0);
      expect(status.newComponents).to.have.lengthOf(0);
      expect(status.outdatedComponents).to.have.lengthOf(0);
    });
    it('bit log should show both snaps', () => {
      const log = helper.command.log('bar/foo');
      const mainSnap = helper.command.getHead('bar/foo');
      const devSnap = helper.command.getHeadOfLane('dev', 'bar/foo');
      expect(log).to.have.string(mainSnap);
      expect(log).to.have.string(devSnap);
    });
    describe('bit lane with --details flag', () => {
      let output: string;
      before(() => {
        output = helper.command.showLanes('--details');
      });
      it('should show all lanes and mark the current one', () => {
        expect(output).to.have.string('current lane - dev');
      });
    });
    describe('bit lane diff on the workspace', () => {
      let diffOutput: string;
      before(() => {
        diffOutput = helper.command.diffLane();
      });
      it('should show the diff correctly', () => {
        expect(diffOutput).to.have.string('--- foo.js (main)');
        expect(diffOutput).to.have.string('+++ foo.js (dev)');

        expect(diffOutput).to.have.string(`-module.exports = function foo() { return 'got foo'; }`);
        expect(diffOutput).to.have.string(`+module.exports = function foo() { return 'got foo v2'; }`);
      });
      it('should not show the id field as it is redundant', () => {
        expect(diffOutput).to.not.have.string('--- Id');
        expect(diffOutput).to.not.have.string('+++ Id');
      });
    });
    describe('bit lane diff {toLane - default} on the workspace', () => {
      let diffOutput: string;
      before(() => {
        helper.command.switchLocalLane('main');
        helper.command.createLane('stage');
        helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
        helper.command.snapAllComponents();
        diffOutput = helper.command.diffLane('main');
      });
      it('should show the diff correctly', () => {
        expect(diffOutput).to.have.string('--- foo.js (stage)');
        expect(diffOutput).to.have.string('+++ foo.js (main)');

        expect(diffOutput).to.have.string(`-module.exports = function foo() { return 'got foo v2'; }`);
        expect(diffOutput).to.have.string(`+module.exports = function foo() { return 'got foo'; }`);
      });
      it('should not show the id field as it is redundant', () => {
        expect(diffOutput).to.not.have.string('--- Id');
        expect(diffOutput).to.not.have.string('+++ Id');
      });
    });
    describe('bit lane diff {toLane - non default} on the workspace', () => {
      let diffOutput: string;
      before(() => {
        helper.command.switchLocalLane('main');
        helper.command.createLane('int');
        diffOutput = helper.command.diffLane('stage');
      });
      it('should show the diff correctly', () => {
        expect(diffOutput).to.have.string('--- foo.js (int)');
        expect(diffOutput).to.have.string('+++ foo.js (stage)');

        expect(diffOutput).to.have.string(`-module.exports = function foo() { return 'got foo'; }`);
        expect(diffOutput).to.have.string(`+module.exports = function foo() { return 'got foo v2'; }`);
      });
      it('should not show the id field as it is redundant', () => {
        expect(diffOutput).to.not.have.string('--- Id');
        expect(diffOutput).to.not.have.string('+++ Id');
      });
    });
    describe('bit lane diff {fromLane} {toLane} on the workspace', () => {
      let diffOutput: string;
      before(() => {
        diffOutput = helper.command.diffLane('main dev');
      });
      it('should show the diff correctly', () => {
        expect(diffOutput).to.have.string('--- foo.js (main)');
        expect(diffOutput).to.have.string('+++ foo.js (dev)');

        expect(diffOutput).to.have.string(`-module.exports = function foo() { return 'got foo'; }`);
        expect(diffOutput).to.have.string(`+module.exports = function foo() { return 'got foo v2'; }`);
      });
      it('should not show the id field as it is redundant', () => {
        expect(diffOutput).to.not.have.string('--- Id');
        expect(diffOutput).to.not.have.string('+++ Id');
      });
    });
    describe('exporting the lane', () => {
      before(() => {
        helper.command.exportLane();
      });
      it('should export components on that lane', () => {
        const list = helper.command.listRemoteScopeParsed();
        expect(list).to.have.lengthOf(1);
      });
      it('bit status should show a clean state', () => {
        const output = helper.command.runCmd('bit status');
        expect(output).to.have.string(statusWorkspaceIsCleanMsg);
      });
      it('should change .bitmap to have the remote lane', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap[LANE_KEY]).to.deep.equal({ name: 'dev', scope: helper.scopes.remote });
      });
      it('bit lane --remote should show the exported lane', () => {
        const remoteLanes = helper.command.showRemoteLanesParsed();
        expect(remoteLanes.lanes).to.have.lengthOf(1);
        expect(remoteLanes.lanes[0].name).to.equal('dev');
      });
      describe('bit lane diff on the scope', () => {
        let diffOutput: string;
        before(() => {
          diffOutput = helper.command.diffLane('dev', true);
        });
        it('should show the diff correctly', () => {
          expect(diffOutput).to.have.string('--- foo.js (main)');
          expect(diffOutput).to.have.string('+++ foo.js (dev)');

          expect(diffOutput).to.have.string(`-module.exports = function foo() { return 'got foo'; }`);
          expect(diffOutput).to.have.string(`+module.exports = function foo() { return 'got foo v2'; }`);
        });
      });
    });
  });
  describe('importing lanes', () => {
    let appOutput: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      appOutput = helper.fixtures.populateComponents();
      helper.command.createLane('dev');
      helper.command.snapAllComponents();
      helper.command.exportLane();
    });
    describe('fetching lanes objects', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
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
        helper.scopeHelper.reInitLocalScopeHarmony();
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
        expect(bitMap[LANE_KEY]).to.deep.equal({ name: 'dev', scope: helper.scopes.remote });
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
        const lanes = helper.command.showLanes();
        expect(lanes).to.have.string('current lane - dev');
      });
    });
    describe('importing the lane and checking out with a different local lane-name', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.addRemoteScope();
        helper.command.switchRemoteLane('dev', '--as my-new-lane');
      });
      it('bit lane should show the component in the checked out lane', () => {
        const lane = helper.command.showOneLaneParsed('my-new-lane');
        expect(lane.components).to.have.lengthOf(3);
      });
      it('bit lane should show the checked out lane as the active one', () => {
        const lanes = helper.command.showLanesParsed();
        expect(lanes.currentLane).to.equal('my-new-lane');
      });
      it('should write the components to the filesystem', () => {
        helper.fs.outputFile('app.js', fixtures.appPrintComp1(helper.scopes.remote));
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal(appOutput);
      });
      it('.bitmap should save the remote lane', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap[LANE_KEY]).to.deep.equal({ name: 'dev', scope: helper.scopes.remote });
      });
    });
  });
  describe('checkout/switching lanes', () => {
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
        helper.command.fetchRemoteLane('dev');
        beforeLaneSwitch = helper.scopeHelper.cloneLocalScope();
        helper.command.switchRemoteLane('dev');
      });
      it('should write the component to the filesystem with the same version as the lane', () => {
        const fileContent = helper.fs.readFile(`${helper.scopes.remote}/bar/foo/foo.js`);
        expect(fileContent).to.equal(fixtures.fooFixtureV2);
      });
      it('.bitmap should save the remote lane', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap[LANE_KEY]).to.deep.equal({ name: 'dev', scope: helper.scopes.remote });
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
        const lanes = helper.command.showLanesParsed();
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
        it('bit status should show the staged hash', () => {
          const status = helper.command.status();
          const localSnap = helper.command.getHeadOfLane('dev', 'bar/foo');
          expect(status).to.have.string(localSnap);
        });
      });
      describe('switching with a different lane name', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(beforeLaneSwitch);
          helper.command.switchRemoteLane('dev', '--as my-new-lane');
        });
        it('should save the remote-lane data into a local with the specified name', () => {
          const lanes = helper.command.showOneLaneParsed('my-new-lane');
          expect(lanes.components).to.have.lengthOf(1);
        });
        it('should not create a lane with the same name as the remote', () => {
          const output = helper.general.runWithTryCatch('bit lane show dev');
          expect(output).to.have.string('not found');
        });
      });
    });
  });
  describe(`switching lanes with deleted files`, () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.createLane('migration');
      helper.fs.outputFile('comp1/comp1.spec.js');
      helper.command.addComponent('comp1/', { t: 'comp1/comp1.spec.js' });
      helper.command.install();
      helper.command.compile();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.switchLocalLane('main');
    });
    it('should delete the comp1/comp1.spec.js file', () => {
      expect(path.join(helper.scopes.localPath, 'comp1/comp1.spec.js')).to.not.be.a.path();
    });
  });
  describe('merging lanes', () => {
    let authorScope;
    let importedScope;
    let appOutput: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      appOutput = helper.fixtures.populateComponents();
      helper.command.createLane('dev');
      helper.command.snapAllComponents();
      helper.command.exportLane();
      authorScope = helper.scopeHelper.cloneLocalScope();
    });
    describe('merging remote lane into main', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.addRemoteScope();
        helper.command.fetchRemoteLane('dev');
        helper.command.mergeRemoteLane(`dev`);
      });
      it('should save the files to the filesystem', () => {
        helper.fs.outputFile('app.js', fixtures.appPrintComp1(helper.scopes.remote));
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal(appOutput);
      });
      it('bit status should show the components as staged', () => {
        const status = helper.command.statusJson();
        expect(status.stagedComponents).to.have.lengthOf(3);
      });
      it('bit lane should show that all components are belong to main', () => {
        const lanes = helper.command.showLanesParsed();
        const defaultLane = lanes.lanes.find((lane) => lane.name === DEFAULT_LANE);
        expect(defaultLane.components).to.have.lengthOf(3);
      });
    });
    describe('merging remote lane into main when components are not in workspace using --existing flag', () => {
      let mergeOutput;
      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.addRemoteScope();
        helper.command.fetchRemoteLane('dev');
        mergeOutput = helper.command.mergeRemoteLane(`dev`, undefined, `--existing`);
      });
      it('should indicate that the components were not merge because they are not in the workspace', () => {
        expect(mergeOutput).to.have.string('the merge has been canceled on the following component(s)');
        expect(mergeOutput).to.have.string('is not in the workspace');
      });
      it('bitmap should not save any component', () => {
        const bitMap = helper.bitMap.readComponentsMapOnly();
        expect(Object.keys(bitMap)).to.have.lengthOf(0);
      });
      it('should not save the files to the filesystem', () => {
        expect(path.join(helper.scopes.localPath, 'components/bar/foo')).to.not.be.a.path();
      });
      it('bit status should show clean state', () => {
        const output = helper.command.runCmd('bit status');
        expect(output).to.have.string(statusWorkspaceIsCleanMsg);
      });
      it('bit lane should not show the components as if they belong to main', () => {
        const lanes = helper.command.showLanesParsed();
        const defaultLane = lanes.lanes.find((lane) => lane.name === DEFAULT_LANE);
        expect(defaultLane.components).to.have.lengthOf(0);
      });
    });
    describe('importing a remote lane which is ahead of the local lane', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.addRemoteScope();
        helper.command.switchRemoteLane('dev');
        importedScope = helper.scopeHelper.cloneLocalScope();
        helper.scopeHelper.getClonedLocalScope(authorScope);
        helper.fixtures.populateComponents(undefined, undefined, ' v2');
        helper.command.snapAllComponents();
        helper.command.exportLane();

        helper.scopeHelper.getClonedLocalScope(importedScope);
        helper.command.fetchRemoteLane('dev');
      });
      it('bit status should show all components as pending update', () => {
        const status = helper.command.statusJson();
        expect(status.outdatedComponents).to.have.lengthOf(3);
      });
      describe('merging the remote lane', () => {
        let mergeOutput;
        before(() => {
          mergeOutput = helper.command.mergeRemoteLane(`dev`);
        });
        it('should succeed', () => {
          expect(mergeOutput).to.have.string('successfully merged components');
        });
        it('should save the latest versions from the remote into the local', () => {
          helper.fs.outputFile('app.js', fixtures.appPrintComp1(helper.scopes.remote));
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('comp1 and comp2 and comp3');
        });
        it('bit status should show clean state', () => {
          const output = helper.command.runCmd('bit status');
          expect(output).to.have.string(statusWorkspaceIsCleanMsg);
        });
        it('bit lane should show that all components are belong to the local lane', () => {
          const lane = helper.command.showOneLaneParsed('dev');
          expect(lane.components).to.have.lengthOf(3);
        });
        it('bit lane --merged should not show the lane as it was not merged into main yet', () => {
          const merged = helper.command.showLanes('--merged');
          expect(merged).to.not.have.string('dev');
          expect(merged).to.have.string('None of the lanes is merged');
        });
        it('bit lane --unmerged should show the lane', () => {
          const merged = helper.command.showLanes('--not-merged');
          expect(merged).to.have.string('dev');
          expect(merged).to.not.have.string('All lanes are merged');
        });
      });
    });
  });
  describe('tagging on a lane', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.createLane();
      helper.command.snapAllComponents();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      output = helper.general.runWithTryCatch('bit tag bar/foo');
    });
    it('should block the tag and suggest to switch to main and merge the changes', () => {
      expect(output).to.have.string(
        'unable to tag when checked out to a lane, please switch to main, merge the lane and then tag again'
      );
    });
  });
  describe('main => lane-a => lane-b, so laneB branched from laneA', () => {
    let beforeSwitchingBack;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      // main
      helper.fs.outputFile('utils/is-type/is-type.js', fixtures.isType);
      helper.command.addComponent('utils/is-type', { i: 'utils/is-type' });
      helper.command.snapAllComponents();

      // laneA
      helper.command.createLane('lane-a');
      helper.fs.outputFile(
        'utils/is-string/is-string.js',
        "const isType = require('../is-type/is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };"
      );
      helper.command.addComponent('utils/is-string', { i: 'utils/is-string' });
      helper.command.linkAndRewire();
      helper.command.compile();
      helper.command.snapAllComponents();

      // laneB
      helper.command.createLane('lane-b');
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.snapAllComponents();

      beforeSwitchingBack = helper.scopeHelper.cloneLocalScope();
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
        const statusParsed = helper.command.statusJson();
        expect(statusParsed.stagedComponents).to.deep.equal(['utils/is-string']);
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
        helper.scopeHelper.getClonedLocalScope(beforeSwitchingBack);
        helper.command.switchLocalLane('main');
      });
      it('bit list should only show main components', () => {
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(1);
      });
      it('bit status should show only main components as staged', () => {
        const statusParsed = helper.command.statusJson();
        expect(statusParsed.stagedComponents).to.deep.equal(['utils/is-type']);
        const status = helper.command.status();
        expect(status).to.not.have.string('bar/foo');
        expect(status).to.not.have.string('utils/is-string');
      });
    });
    describe('switching to lane-a then to main', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeSwitchingBack);
        helper.command.switchLocalLane('lane-a');
        helper.command.switchLocalLane('main');
      });
      it('bit list should only show main components', () => {
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(1);
      });
      it('bit status should show only main components as staged', () => {
        const statusParsed = helper.command.statusJson();
        expect(statusParsed.stagedComponents).to.deep.equal(['utils/is-type']);
        const status = helper.command.status();
        expect(status).to.not.have.string('bar/foo');
        expect(status).to.not.have.string('utils/is-string');
      });
    });
  });
  // @todo: implement
  describe('main => lane-a => labe-b, so laneB branched from laneA all exported', () => {
    describe('then cloned to another project and checked out to lane-a', () => {
      it('lane-a should not include lane-b component, although locally it switched from it', () => {});
    });
  });
  describe('importing a component when checked out to a lane', () => {
    let beforeImport;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.tagAllComponents();
      helper.command.export();
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.command.createLane();
      beforeImport = helper.scopeHelper.cloneLocalScope();
    });
    describe('without --skip-lane flag', () => {
      before(() => {
        helper.command.importComponent('bar/foo');
      });
      it('the component should be part of the lane', () => {
        const lane = helper.command.showOneLaneParsed('dev');
        expect(lane.components).to.have.lengthOf(1);
      });
      describe('switching to main', () => {
        before(() => {
          helper.command.switchLocalLane('main');
        });
        it('bit list should not show the component', () => {
          const list = helper.command.listParsed();
          expect(list).to.have.lengthOf(0);
        });
      });
    });
    describe('with --skip-lane flag', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeImport);
        helper.command.importComponent('bar/foo --skip-lane');
      });
      it('the component should not be part of the current lane', () => {
        const lane = helper.command.showOneLaneParsed('dev');
        expect(lane.components).to.have.lengthOf(0);
      });
      describe('switching to main', () => {
        before(() => {
          helper.command.switchLocalLane('main');
        });
        it('bit list should show the component', () => {
          const list = helper.command.listLocalScopeParsed();
          expect(list).to.have.lengthOf(1);
        });
      });
    });
  });
  describe('branching out when a component is checked out to an older version', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.tagAllComponents();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.bitJsonc.setupDefault();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo@0.0.1');

      helper.command.createLane();
      helper.fs.outputFile(`${helper.scopes.remote}/bar/foo/foo.js`, fixtures.fooFixtureV3);
      helper.command.snapAllComponents();

      helper.command.switchLocalLane('main');
    });
    it('should checkout to the same version the origin branch had before the switch', () => {
      helper.bitMap.expectToHaveIdHarmony('bar/foo', '0.0.1');
    });
    it('bit status should not show the component as modified only as pending update', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponent).to.have.lengthOf(0);
      expect(status.outdatedComponents).to.have.lengthOf(1);
      expect(status.importPendingComponents).to.have.lengthOf(0);
      expect(status.stagedComponents).to.have.lengthOf(0);
      expect(status.invalidComponents).to.have.lengthOf(0);
      expect(status.newComponents).to.have.lengthOf(0);
    });
  });
  describe('remove lanes', () => {
    describe('switching to a new lane and snapping', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
        helper.bitJsonc.setupDefault();
        helper.fixtures.populateComponents();
        helper.command.snapAllComponents();
        helper.command.export();

        helper.command.createLane();
        helper.command.snapComponent('comp1 -f');
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
            const lanes = helper.command.showLanes();
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
        helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
        helper.bitJsonc.setupDefault();
        helper.command.createLane();
        helper.fixtures.populateComponents();
        helper.command.snapAllComponents();
        helper.command.export();
      });
      it('as an intermediate step, make sure the lane is on the remote', () => {
        const lanes = helper.command.showRemoteLanesParsed();
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
          const lanes = helper.command.showRemoteLanesParsed();
          expect(lanes.lanes).to.have.lengthOf(0);
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
            expect(removeOutput).to.have.string('lane dev was not found in scope');
          });
        });
      });
    });
  });
  describe('remove components when on a lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.createLane();
      helper.fixtures.populateComponents(undefined, undefined, ' v2');
      helper.command.snapAllComponentsWithoutBuild();
    });
    it('as an intermediate step, make sure the snapped components are part of the lane', () => {
      const lane = helper.command.showOneLaneParsed('dev');
      expect(lane.components).to.have.lengthOf(3);
    });
    describe('removing a component that has dependents', () => {
      let output;
      before(() => {
        output = helper.command.removeComponent('comp3');
      });
      it('should stop the process and indicate that a component has dependents', () => {
        expect(output).to.have.string('error: unable to delete');
      });
    });
    describe('removing a component that has no dependents', () => {
      let output;
      before(() => {
        output = helper.command.removeComponent('comp1');
      });
      it('should indicate that the component was removed from the lane', () => {
        expect(output).to.have.string('lane');
        expect(output).to.have.string('successfully removed components');
      });
      it('should remove the component from the lane', () => {
        const lane = helper.command.showOneLaneParsed('dev');
        expect(lane.components).to.have.lengthOf(2);
        lane.components.forEach((c) => expect(c.id.name).to.not.have.string('comp1'));
      });
      it('should not remove the component from .bitmap', () => {
        const head = helper.command.getHead('comp1');
        helper.bitMap.expectToHaveIdHarmony('comp1', head, helper.scopes.remote);
      });
      it('should not delete the files from the filesystem', () => {
        expect(path.join(helper.scopes.localPath, 'comp1/index.js')).to.be.a.file();
      });
    });
  });
  describe('remove a new component when on a lane', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fixtures.populateComponents(1);
      helper.command.createLane();
      helper.command.removeComponent('comp1');
    });
    it('should remove the component from the .bitmap file', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.not.have.property('comp1');
    });
  });
  // this makes sure that when exporting lanes, it only exports the local snaps.
  // in this test, the second snap is done on a clean scope without the objects of the first snap.
  describe('snap on lane, export, clear project, snap and export', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.addDefaultScope();
      // Do not add "disablePreview()" here. It's important to generate the preview here.
      // this is the file that exists on the first snap but not on the second.
      helper.command.createLane();
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponents();
      helper.command.exportLane();
      helper.git.mimicGitCloneLocalProjectHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.command.switchRemoteLane('dev');
      helper.fixtures.populateComponents(1, undefined, ' v2');
      helper.bitJsonc.disablePreview();
      helper.command.snapAllComponents();
    });
    it('should export with no errors about missing artifact files from the first snap', () => {
      expect(() => helper.command.export()).to.not.throw();
    });
  });
  describe('auto-snap when on a lane', () => {
    let snapOutput;
    let comp3Head;
    let comp2Head;
    let comp1Head;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.command.createLane();
      helper.fixtures.populateComponents();
      helper.command.snapAllComponents();

      helper.fs.outputFile('comp3/index.js', `module.exports = () => 'comp3 v2';`);

      const statusOutput = helper.command.runCmd('bit status');
      expect(statusOutput).to.have.string('components pending to be tagged automatically');

      snapOutput = helper.command.snapComponent('comp3');
      comp3Head = helper.command.getHeadOfLane('dev', 'comp3');
      comp2Head = helper.command.getHeadOfLane('dev', 'comp2');
      comp1Head = helper.command.getHeadOfLane('dev', 'comp1');
    });
    it('should auto snap the dependencies and the nested dependencies', () => {
      expect(snapOutput).to.have.string(AUTO_SNAPPED_MSG);
    });
    it('should update the dependencies and the flattenedDependencies of the dependent with the new versions', () => {
      const isString = helper.command.catComponent(`comp2@${comp2Head}`);
      expect(isString.dependencies[0].id.name).to.equal('comp3');
      expect(isString.dependencies[0].id.version).to.equal(comp3Head);

      expect(isString.flattenedDependencies).to.deep.include({ name: 'comp3', version: comp3Head });
    });
    it('should update the dependencies and the flattenedDependencies of the dependent of the dependent with the new versions', () => {
      const barFoo = helper.command.catComponent(`comp1@${comp1Head}`);
      expect(barFoo.dependencies[0].id.name).to.equal('comp2');
      expect(barFoo.dependencies[0].id.version).to.equal(comp2Head);

      expect(barFoo.flattenedDependencies).to.deep.include({ name: 'comp3', version: comp3Head });
      expect(barFoo.flattenedDependencies).to.deep.include({ name: 'comp2', version: comp2Head });
    });
    it('bit-status should show them all as staged and not modified', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponent).to.be.empty;
      expect(status.stagedComponents).to.include('comp1');
      expect(status.stagedComponents).to.include('comp2');
      expect(status.stagedComponents).to.include('comp3');
    });
    // @todo
    describe.skip('importing the component to another scope', () => {
      before(() => {
        helper.command.export();

        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('comp1');
      });
      it('should use the updated dependencies and print the results from the latest versions', () => {
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), fixtures.appPrintComp1(helper.scopes.remote));
        const result = helper.command.runCmd('node app.js');
        // notice the "v2" (!)
        expect(result.trim()).to.equal('got is-type v2 and got is-string and got foo');
      });
    });
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('import with dependencies as packages', () => {
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(3);
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCiInPackageJsonHarmony();
      await npmCiRegistry.init();
      helper.command.tagAllComponents();
      helper.command.export();
      helper.scopeHelper.reInitLocalScopeHarmony();
      npmCiRegistry.setResolver();
      helper.command.importComponent('comp1');
    });
    after(() => {
      npmCiRegistry.destroy();
    });
    describe('switching to a new lane', () => {
      before(() => {
        helper.command.createLane();
      });
      it('should not show all components are staged', () => {
        helper.command.expectStatusToBeClean();
      });
    });
  });
  describe('tag on main, export, create lane and snap', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.populateComponents(2, undefined, 'v2');
      helper.command.snapAllComponentsWithoutBuild();
    });
    it('bit status should show the correct staged versions', () => {
      // before it was a bug that "versions" part of the staged-component was empty
      // another bug was that it had all versions included exported.
      const status = helper.command.status();
      const hash = helper.command.getHeadOfLane('dev', 'comp1');
      expect(status).to.have.string(`versions: ${hash} ...`);
    });
    describe('export the lane, then switch back to main', () => {
      let afterSwitchingLocal: string;
      let afterSwitchingRemote: string;
      before(() => {
        helper.command.exportLane();
        helper.command.switchLocalLane('main');
        afterSwitchingLocal = helper.scopeHelper.cloneLocalScope();
        afterSwitchingRemote = helper.scopeHelper.cloneRemoteScope();
      });
      it('status should not show the components as pending updates', () => {
        helper.command.expectStatusToBeClean();
      });
      describe('switch the lane back to dev', () => {
        before(() => {
          helper.command.switchLocalLane('dev');
        });
        // before, it was changing the version to the head of the lane
        it('should not change the version prop in .bitmap', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap.comp1.version).to.equal('0.0.1');
        });
        describe('switch back to main', () => {
          before(() => {
            helper.command.switchLocalLane('main');
          });
          it('status should not show the components as pending updates', () => {
            helper.command.expectStatusToBeClean();
          });
        });
      });
      describe('merging the dev lane when the lane is ahead (no diverge)', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(afterSwitchingLocal);
          helper.command.mergeLane('dev');
        });
        it('should merge the lane', () => {
          const mergedLanes = helper.command.showLanes('--merged');
          expect(mergedLanes).to.include('dev');
        });
        it('should show the merged components as staged', () => {
          const status = helper.command.statusJson();
          expect(status.stagedComponents).to.have.lengthOf(2);
        });
        describe('tagging the components', () => {
          before(() => {
            helper.command.tagScope();
          });
          it('should be able to export with no errors', () => {
            expect(() => helper.command.export()).not.to.throw();
          });
        });
      });
      describe('merging the dev lane when the lane has diverged from main', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(afterSwitchingLocal);
          helper.scopeHelper.getClonedRemoteScope(afterSwitchingRemote);
          helper.fixtures.populateComponents(2, undefined, 'v3');
          helper.command.snapAllComponentsWithoutBuild();
          helper.command.mergeLane('dev', '--ours');
        });
        it('should merge the lane', () => {
          const mergedLanes = helper.command.showLanes('--merged');
          expect(mergedLanes).to.include('dev');
        });
        it('should show the merged components as staged', () => {
          const status = helper.command.statusJson();
          expect(status.stagedComponents).to.have.lengthOf(2);
        });
        describe('tagging the components', () => {
          before(() => {
            helper.command.tagScope();
          });
          it('should be able to export with no errors', () => {
            expect(() => helper.command.export()).not.to.throw();
          });
        });
      });
    });
  });
  describe('untag on a lane', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.command.createLane();
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
      output = helper.command.untagAll();
    });
    it('should untag successfully', () => {
      expect(output).to.have.string('1 component(s) were untagged');
    });
    it('should change the component to be new', () => {
      const status = helper.command.statusJson();
      expect(status.newComponents).to.have.lengthOf(1);
    });
  });
  describe('default tracking data', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.bitJsonc.setupDefault();
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
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.bitJsonc.setupDefault();
      helper.command.createLane();
      output = helper.command.trackLane('dev', 'my-remote');
    });
    it('should output the changes', () => {
      expect(output).to.have.string(`the remote-scope has been changed from ${helper.scopes.remote} to my-remote`);
    });
    it('bit lane show should show the changed values', () => {
      const laneData = helper.command.showOneLane('dev');
      expect(laneData).to.have.string(`my-remote${LANE_REMOTE_DELIMITER}dev`);
    });
  });
  describe('bit-import with no params when checked out to a lane', () => {
    let importOutput: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.command.createLane('dev');
      helper.fixtures.populateComponents();
      helper.command.snapAllComponents();
      helper.command.exportLane();

      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.command.switchRemoteLane('dev');

      importOutput = helper.command.import();
    });
    // before, it was throwing an error about missing head.
    it('should import the remote lane successfully', () => {
      expect(importOutput).to.have.string('successfully imported 3 components');
    });
  });
  describe('multiple scopes', () => {
    let anotherRemote: string;
    let localScope: string;
    let remoteScope: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      anotherRemote = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);
      helper.fs.outputFile('bar1/foo1.js', 'console.log("v1");');
      helper.fs.outputFile('bar2/foo2.js', 'console.log("v1");');
      helper.command.addComponent('bar1');
      helper.command.addComponent('bar2');
      helper.bitJsonc.addToVariant('bar2', 'defaultScope', anotherRemote);
      helper.command.linkAndRewire();
      helper.command.compile();
      helper.command.tagAllComponents();
      helper.command.export();

      helper.command.createLane();
      helper.fs.outputFile('bar1/foo1.js', 'console.log("v2");');
      helper.fs.outputFile('bar2/foo2.js', 'console.log("v2");');
      helper.command.snapAllComponents();

      localScope = helper.scopeHelper.cloneLocalScope();
      remoteScope = helper.scopeHelper.cloneRemoteScope();
    });
    // previously, it was showing an error about missing versions.
    describe('exporting the lane to the remote', () => {
      it('should not throw an error', () => {
        expect(() => helper.command.export()).to.not.throw();
      });
      // previously, it was changing the scope-name of bar2 to the first remote.
      it('the components scope should not be changed on the remote', () => {
        const catRemote = helper.command.catScope(false, helper.scopes.remotePath);
        const bar2 = catRemote.find((c) => c.name === 'bar2');
        expect(bar2.scope).to.equal(anotherRemote);
      });
    });
    describe('when artifacts from older versions are missing locally', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.scopeHelper.getClonedRemoteScope(remoteScope);
        // delete an artifact
        const artifacts = helper.command.getArtifacts(`${anotherRemote}/bar2@0.0.1`);
        const pkgArtifacts = artifacts.find((a) => a.generatedBy === 'teambit.pkg/pkg');
        const artifactFileHash = pkgArtifacts.files[0].file;
        const hashPath = helper.general.getHashPathOfObject(artifactFileHash);
        helper.fs.deleteObject(hashPath);
      });
      // previously, throwing an error "unable to find an artifact object file".
      it('should not throw an error', () => {
        expect(() => helper.command.export()).to.not.throw();
      });
    });
    describe('importing the lane', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.scopeHelper.getClonedRemoteScope(remoteScope);
        helper.command.export();
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.addRemoteScope();
      });
      // previously, it was throwing an error while trying to fetch these two components, each from its own scope.
      it('should not throw an error', () => {
        expect(() => helper.command.switchRemoteLane('dev')).to.not.throw();
      });
    });
  });
  describe('snapping and un-tagging on a lane', () => {
    let afterFirstSnap: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      afterFirstSnap = helper.scopeHelper.cloneLocalScope();
      helper.command.untagAll();
    });
    it('bit lane show should not show the component as belong to the lane anymore', () => {
      const lane = helper.command.showOneLaneParsed('dev');
      expect(lane.components).to.have.lengthOf(0);
    });
    // a previous bug kept the WorkspaceLane object as is with the previous, untagged version
    it('bit list should not show the currentVersion as the untagged version', () => {
      const list = helper.command.listParsed();
      expect(list[0].currentVersion).to.equal('N/A');
    });
    describe('switching to main', () => {
      before(() => {
        helper.command.switchLocalLane('main');
      });
      it('bit status should show the component as new', () => {
        const status = helper.command.statusJson();
        expect(status.newComponents).to.have.lengthOf(1);
      });
    });
    describe('add another snap and then untag only the last snap', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(afterFirstSnap);
        helper.command.snapComponentWithoutBuild('comp1', '--force');
        const head = helper.command.getHeadOfLane('dev', 'comp1');
        helper.command.untagAll(head);
      });
      it('should not show the component as new', () => {
        const status = helper.command.statusJson();
        expect(status.newComponents).to.have.lengthOf(0);
        expect(status.stagedComponents).to.have.lengthOf(1);
      });
    });
    describe('un-snap by specifying the component name', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(afterFirstSnap);
      });
      // a previous bug was showing "unable to untag comp1, the component is not staged" error.
      it('should not throw an error', () => {
        expect(() => helper.command.untag('comp1')).to.not.throw();
      });
    });
  });
  describe('bit checkout to a previous snap', () => {
    let firstSnap: string;
    let secondSnap: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      firstSnap = helper.command.getHeadOfLane('dev', 'comp1');
      helper.fixtures.populateComponents(1, undefined, 'v2');
      helper.command.snapComponentWithoutBuild('comp1');
      secondSnap = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.checkoutVersion(firstSnap, 'comp1');
    });
    it('should not show the component as modified', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponent).to.have.lengthOf(0);
    });
    it('bit list should show the scope-version as latest and workspace-version as the checked out one', () => {
      const list = helper.command.listParsed();
      const comp1 = list[0];
      expect(comp1.currentVersion).to.equal(firstSnap);
      expect(comp1.localVersion).to.equal(secondSnap);
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
