import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';

import { AUTO_SNAPPED_MSG } from '../../src/cli/commands/public-cmds/snap-cmd';
import { statusWorkspaceIsCleanMsg } from '../../src/cli/commands/public-cmds/status-cmd';
import { DEFAULT_LANE, IS_WINDOWS } from '../../src/constants';
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
    helper.command.setFeatures([HARMONY_FEATURE]);
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
  describe('create a snap on master then on a new lane', () => {
    let beforeExport;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.snapAllComponents();
      helper.command.createLane();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      helper.command.snapAllComponents();
      beforeExport = helper.scopeHelper.cloneLocalScope();
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
      const masterSnap = helper.command.getHead('bar/foo');
      const devSnap = helper.command.getHeadOfLane('dev', 'bar/foo');
      expect(log).to.have.string(masterSnap);
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
    describe('exporting the lane by explicitly entering the lane to the cli', () => {
      before(() => {
        helper.command.exportLane('dev');
      });
      it('should export components on that lane', () => {
        const list = helper.command.listRemoteScopeParsed();
        expect(list).to.have.lengthOf(1);
      });
      it('bit status should show a clean state', () => {
        const output = helper.command.runCmd('bit status');
        expect(output).to.have.string(statusWorkspaceIsCleanMsg);
      });
      it('bit lane --remote should show the exported lane', () => {
        const remoteLanes = helper.command.showRemoteLanesParsed();
        expect(remoteLanes.lanes).to.have.lengthOf(1);
        expect(remoteLanes.lanes[0].name).to.equal('dev');
      });
    });
    describe('exporting the lane implicitly (no lane-name entered)', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeExport);
        helper.scopeHelper.reInitRemoteScope();
        helper.command.export(`${helper.command.scopes.remote} --lanes`);
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
      helper.command.exportLane('dev');
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
        helper.command.exportLane('dev');

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
        it('should not show the diff between the filesystem and master', () => {
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
          const output = helper.general.runWithTryCatch('bit lane dev');
          expect(output).to.have.string('not found');
        });
      });
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
      helper.command.exportLane('dev');
      authorScope = helper.scopeHelper.cloneLocalScope();
    });
    describe('merging remote lane into master', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.addRemoteScope();
        helper.command.fetchRemoteLane('dev');
        helper.command.merge(`${helper.scopes.remote} dev --lane`);
      });
      it('should save the files to the filesystem', () => {
        helper.fs.outputFile('app.js', fixtures.appPrintComp1(helper.scopes.remote));
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal(appOutput);
      });
      it('bit status should show clean state', () => {
        const output = helper.command.runCmd('bit status');
        expect(output).to.have.string(statusWorkspaceIsCleanMsg);
      });
      it('bit lane should show that all components are belong to master', () => {
        const lanes = helper.command.showLanesParsed();
        const defaultLane = lanes.lanes.find((lane) => lane.name === DEFAULT_LANE);
        expect(defaultLane.components).to.have.lengthOf(3);
      });
    });
    describe('merging remote lane into master when components are not in workspace using --existing flag', () => {
      let mergeOutput;
      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.addRemoteScope();
        helper.command.fetchRemoteLane('dev');
        mergeOutput = helper.command.merge(`${helper.scopes.remote} dev --lane --existing`);
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
      it('bit lane should not show the components as if they belong to master', () => {
        const lanes = helper.command.showLanesParsed();
        const defaultLane = lanes.lanes.find((lane) => lane.name === DEFAULT_LANE);
        expect(defaultLane.components).to.have.lengthOf(0);
      });
    });
    // @todo: fix as soon as the import is working properly on Harmony
    describe.skip('importing a remote lane which is ahead of the local lane', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.addRemoteScope();
        helper.command.switchRemoteLane('dev');
        importedScope = helper.scopeHelper.cloneLocalScope();
        helper.scopeHelper.getClonedLocalScope(authorScope);
        helper.fixtures.populateComponents(undefined, undefined, ' v2');
        helper.command.snapAllComponents();
        helper.command.exportLane('dev');

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
          mergeOutput = helper.command.merge(`${helper.scopes.remote} dev --lane`);
        });
        it('should succeed', () => {
          expect(mergeOutput).to.have.string('successfully merged components');
        });
        it('should save the latest versions from the remote into the local', () => {
          helper.fs.outputFile('app.js', fixtures.appPrintComp1(helper.scopes.remote));
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type v2 and got is-string v2 and got foo v2');
        });
        it('bit status should show clean state', () => {
          const output = helper.command.runCmd('bit status');
          expect(output).to.have.string(statusWorkspaceIsCleanMsg);
        });
        it('bit lane should show that all components are belong to the local lane', () => {
          const lane = helper.command.showOneLaneParsed('dev');
          expect(lane.components).to.have.lengthOf(3);
        });
        it('bit lane --merged should not show the lane as it was not merged into master yet', () => {
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
      output = helper.general.runWithTryCatch('bit tag bar/foo --persist');
    });
    it('should block the tag and suggest to switch to master and merge the changes', () => {
      expect(output).to.have.string(
        'unable to tag when checked out to a lane, please switch to master, merge the lane and then tag again'
      );
    });
  });
  describe('master => lane-a => labe-b, so laneB branched from laneA', () => {
    let beforeSwitchingBack;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      // master
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
    it('lane-a should not contain components from master', () => {
      const lane = helper.command.showOneLaneParsed('lane-a');
      expect(lane.components).to.have.lengthOf(1);
    });
    it('laneB object should include components from laneA, but not from master', () => {
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
      // master components belong to lane-a only if they are snapped on lane-a, so utils/is-type
      // doesn't belong to lane-a and should not appear as staged when on lane-a.
      it('bit status should not show neither lane-b nor master components as staged', () => {
        const statusParsed = helper.command.statusJson();
        expect(statusParsed.stagedComponents).to.deep.equal(['utils/is-string']);
        const status = helper.command.status();
        expect(status).to.not.have.string('bar/foo');
      });
      it('bit list should not show lane-b components', () => {
        const list = helper.command.listLocalScopeParsed();
        expect(list).to.have.lengthOf(2);
      });
      // @todo: test each one of the commands on bar/foo
    });
    describe('checking out from lane-b to master', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeSwitchingBack);
        helper.command.switchLocalLane('master');
      });
      it('bit list should only show master components', () => {
        const list = helper.command.listLocalScopeParsed();
        expect(list).to.have.lengthOf(1);
      });
      it('bit status should show only master components as staged', () => {
        const statusParsed = helper.command.statusJson();
        expect(statusParsed.stagedComponents).to.deep.equal(['utils/is-type']);
        const status = helper.command.status();
        expect(status).to.not.have.string('bar/foo');
        expect(status).to.not.have.string('utils/is-string');
      });
    });
    describe('switching to lane-a then to master', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeSwitchingBack);
        helper.command.switchLocalLane('lane-a');
        helper.command.switchLocalLane('master');
      });
      it('bit list should only show master components', () => {
        const list = helper.command.listLocalScopeParsed();
        expect(list).to.have.lengthOf(1);
      });
      it('bit status should show only master components as staged', () => {
        const statusParsed = helper.command.statusJson();
        expect(statusParsed.stagedComponents).to.deep.equal(['utils/is-type']);
        const status = helper.command.status();
        expect(status).to.not.have.string('bar/foo');
        expect(status).to.not.have.string('utils/is-string');
      });
    });
  });
  // @todo: implement
  describe('master => lane-a => labe-b, so laneB branched from laneA all exported', () => {
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
      describe('switching to master', () => {
        before(() => {
          helper.command.switchLocalLane('master');
        });
        it('bit list should not show the component', () => {
          const list = helper.command.listLocalScopeParsed();
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
      describe('switching to master', () => {
        before(() => {
          helper.command.switchLocalLane('master');
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

      helper.command.switchLocalLane('master');
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
        const output = helper.general.runWithTryCatch('bit remove dev --lane -s');
        expect(output).to.have.string('unable to remove the currently used lane');
      });
      it('should not alow removing the default lane', () => {
        const output = helper.general.runWithTryCatch(`bit remove ${DEFAULT_LANE} --lane -s`);
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
            output = helper.general.runWithTryCatch('bit remove dev --lane -s');
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
        helper.command.export(`${helper.command.scopes.remote} --lanes`);
      });
      it('as an intermediate step, make sure the lane is on the remote', () => {
        const lanes = helper.command.showRemoteLanesParsed();
        expect(lanes.lanes).to.have.lengthOf(1);
      });
      it('should not remove without --force flag as the lane is not merged', () => {
        const output = helper.general.runWithTryCatch(
          `bit remove ${helper.scopes.remote}/dev --lane --remote --silent`
        );
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
              `bit remove ${helper.scopes.remote}/dev --lane --remote --silent --force`
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
      helper.command.snapAllComponents();
      helper.command.export();

      helper.command.createLane();
      helper.fixtures.populateComponents(undefined, undefined, ' v2');
      helper.command.snapAllComponents();
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
      helper.command.exportLane('dev');
      helper.git.mimicGitCloneLocalProjectHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.command.switchRemoteLane('dev');
      helper.fixtures.populateComponents(1, undefined, ' v2');
      helper.bitJsonc.disablePreview();
      helper.command.snapAllComponents();
    });
    it('should export with no errors about missing artifact files from the first snap', () => {
      expect(() => helper.command.export(`${helper.command.scopes.remote} --lanes`)).to.not.throw();
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
      helper.command.setFeatures(HARMONY_FEATURE);
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
  describe('tag on master, export, create lane and snap', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.populateComponents(1, undefined, 'v2');
      helper.command.snapAllComponentsWithoutBuild();
    });
    it('bit status should show the correct staged versions', () => {
      // before it was a bug that "versions" part of the staged-component was empty
      // another bug was that it had all versions included exported.
      const status = helper.command.status();
      const hash = helper.command.getHeadOfLane('dev', 'comp1');
      expect(status).to.have.string(`versions: ${hash} ...`);
    });
  });
});
