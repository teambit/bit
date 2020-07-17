import path from 'path';
import fs from 'fs-extra';
import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';
import { statusWorkspaceIsCleanMsg } from '../../src/cli/commands/public-cmds/status-cmd';
import { LANE_KEY } from '../../src/consumer/bit-map/bit-map';
import { removeChalkCharacters } from '../../src/utils';
import { DEFAULT_LANE } from '../../src/constants';
import { AUTO_SNAPPED_MSG } from '../../src/cli/commands/public-cmds/snap-cmd';

chai.use(require('chai-fs'));

describe('bit lane command', function () {
  this.timeout(0);
  const helper = new Helper();
  helper.command.setFeatures('lanes');
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('creating a new lane without any component', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
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
        helper.command.export(helper.command.scopes.remote);
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
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithComponents();
      helper.command.createLane('dev');
      helper.command.snapAllComponents();
      helper.command.exportLane('dev');
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
    });
    describe('importing the lane and checking out by bit switch', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.switchRemoteLane('dev');
      });
      it('should write the components to the filesystem', () => {
        helper.fs.outputFile('app.js', fixtures.appPrintBarFoo);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
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
        helper.scopeHelper.reInitLocalScope();
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
        helper.fs.outputFile('app.js', fixtures.appPrintBarFoo);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
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
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFoo();
        helper.command.snapAllComponents();
        helper.command.createLane();
        helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
        helper.command.snapAllComponents();
        helper.command.exportLane('dev');

        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.fetchRemoteLane('dev');
        beforeLaneSwitch = helper.scopeHelper.cloneLocalScope();
        helper.command.switchRemoteLane('dev');
      });
      it('should write the component to the filesystem with the same version as the lane', () => {
        const fileContent = helper.fs.readFile('components/bar/foo/foo.js');
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
          helper.fs.outputFile('components/bar/foo/foo.js', fixtures.fooFixtureV3);
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
          helper.fs.outputFile('components/bar/foo/foo.js', fixtures.fooFixtureV3);
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
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithComponents();
      helper.command.createLane('dev');
      helper.command.snapAllComponents();
      helper.command.exportLane('dev');
      authorScope = helper.scopeHelper.cloneLocalScope();
    });
    describe('merging remote lane into master', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.fetchRemoteLane('dev');
        helper.command.merge(`${helper.scopes.remote} dev --lane`);
      });
      it('should save the files to the filesystem', () => {
        helper.fs.outputFile('app.js', fixtures.appPrintBarFoo);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
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
        helper.scopeHelper.reInitLocalScope();
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
    describe('importing a remote lane which is ahead of the local lane', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.switchRemoteLane('dev');
        importedScope = helper.scopeHelper.cloneLocalScope();

        helper.scopeHelper.getClonedLocalScope(authorScope);
        helper.fixtures.populateWorkspaceWithComponentsWithV2();
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
          helper.fs.outputFile('app.js', fixtures.appPrintBarFoo);
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
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.createLane();
      helper.command.snapAllComponents();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      output = helper.general.runWithTryCatch('bit tag bar/foo');
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();

      // master
      helper.fixtures.createComponentUtilsIsType();
      helper.fixtures.addComponentUtilsIsType();
      helper.command.snapAllComponents();

      // laneA
      helper.command.createLane('lane-a');
      helper.fixtures.createComponentUtilsIsString();
      helper.fixtures.addComponentUtilsIsString();
      helper.command.snapAllComponents();

      // laneB
      helper.command.createLane('lane-b');
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
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
      it('bit status should not show lane-b components as staged', () => {
        const statusParsed = helper.command.statusJson();
        expect(statusParsed.stagedComponents).to.deep.equal(['utils/is-string', 'utils/is-type']);
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo@0.0.1');

      helper.command.createLane();
      helper.fs.outputFile('components/bar/foo/foo.js', fixtures.fooFixtureV3);
      helper.command.snapAllComponents();

      helper.command.switchLocalLane('master');
    });
    it('should checkout to the same version the origin branch had before the switch', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property(`${helper.scopes.remote}/bar/foo@0.0.1`);
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
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.populateWorkspaceWithComponents();
        helper.command.snapAllComponents();
        helper.command.exportAllComponents();

        helper.command.createLane();
        helper.command.snapComponent('bar/foo -f');
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
          beforeRemove = helper.scopeHelper.cloneLocalScope();
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
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.command.createLane();
        helper.fixtures.populateWorkspaceWithComponents();
        helper.command.snapAllComponents();
        helper.command.exportAllComponents();
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithComponents();
      helper.command.snapAllComponents();
      helper.command.exportAllComponents();

      helper.command.createLane();
      helper.fixtures.populateWorkspaceWithComponentsWithV2();
      helper.command.snapAllComponents();
    });
    it('as an intermediate step, make sure the snapped components are part of the lane', () => {
      const lane = helper.command.showOneLaneParsed('dev');
      expect(lane.components).to.have.lengthOf(3);
    });
    describe('removing a component that has dependents', () => {
      let output;
      before(() => {
        output = helper.command.removeComponent('utils/is-type --silent');
      });
      it('should stop the process and indicate that a component has dependents', () => {
        expect(output).to.have.string('error: unable to delete');
      });
    });
    describe('removing a component that has no dependents', () => {
      let output;
      before(() => {
        output = helper.command.removeComponent('bar/foo --silent');
      });
      it('should indicate that the component was removed from the lane', () => {
        expect(output).to.have.string('lane');
        expect(output).to.have.string('successfully removed components');
      });
      it('should remove the component from the lane', () => {
        const lane = helper.command.showOneLaneParsed('dev');
        expect(lane.components).to.have.lengthOf(2);
        lane.components.forEach((c) => expect(c.id.name).to.not.have.string('bar'));
      });
      it('should not remove the component from .bitmap', () => {
        const bitMap = helper.bitMap.read();
        const head = helper.command.getHead('bar/foo');
        expect(bitMap).to.have.property(`${helper.scopes.remote}/bar/foo@${head}`);
      });
      it('should not delete the files from the filesystem', () => {
        expect(path.join(helper.scopes.localPath, 'bar/foo.js')).to.be.a.file();
      });
    });
  });
  describe('auto-snap when on a lane', () => {
    let snapOutput;
    let isTypeHead;
    let isStringHead;
    let barFooHead;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.createLane();
      helper.fixtures.populateWorkspaceWithComponents();
      helper.command.snapAllComponents();

      helper.fs.createFile('utils', 'is-type.js', fixtures.isTypeV2);

      const statusOutput = helper.command.runCmd('bit status');
      expect(statusOutput).to.have.string('components pending to be tagged automatically');

      snapOutput = helper.command.snapComponent('utils/is-type');
      isTypeHead = helper.command.getHeadOfLane('dev', 'utils/is-type');
      isStringHead = helper.command.getHeadOfLane('dev', 'utils/is-string');
      barFooHead = helper.command.getHeadOfLane('dev', 'bar/foo');
    });
    it('should auto snap the dependencies and the nested dependencies', () => {
      expect(snapOutput).to.have.string(AUTO_SNAPPED_MSG);
    });
    it('should update the dependencies and the flattenedDependencies of the dependent with the new versions', () => {
      const isString = helper.command.catComponent(`utils/is-string@${isStringHead}`);
      expect(isString.dependencies[0].id.name).to.equal('utils/is-type');
      expect(isString.dependencies[0].id.version).to.equal(isTypeHead);

      expect(isString.flattenedDependencies).to.deep.include({ name: 'utils/is-type', version: isTypeHead });
    });
    it('should update the dependencies and the flattenedDependencies of the dependent of the dependent with the new versions', () => {
      const barFoo = helper.command.catComponent(`bar/foo@${barFooHead}`);
      expect(barFoo.dependencies[0].id.name).to.equal('utils/is-string');
      expect(barFoo.dependencies[0].id.version).to.equal(isStringHead);

      expect(barFoo.flattenedDependencies).to.deep.include({ name: 'utils/is-type', version: isTypeHead });
      expect(barFoo.flattenedDependencies).to.deep.include({ name: 'utils/is-string', version: isStringHead });
    });
    it('bit-status should show them all as staged and not modified', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponent).to.be.empty;
      expect(status.stagedComponents).to.include('bar/foo');
      expect(status.stagedComponents).to.include('utils/is-string');
      expect(status.stagedComponents).to.include('utils/is-type');
    });
    // @todo
    describe.skip('importing the component to another scope', () => {
      before(() => {
        helper.command.exportAllComponents();

        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo');
      });
      it('should use the updated dependencies and print the results from the latest versions', () => {
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), fixtures.appPrintBarFoo);
        const result = helper.command.runCmd('node app.js');
        // notice the "v2" (!)
        expect(result.trim()).to.equal('got is-type v2 and got is-string and got foo');
      });
    });
  });
});
