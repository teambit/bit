import chai, { expect } from 'chai';
import path from 'path';
import { DEFAULT_LANE } from '@teambit/lane-id';
import { statusWorkspaceIsCleanMsg } from '@teambit/legacy.constants';
import { Helper, fixtures } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('merge lanes basic', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('export a local lane into a remote scope', () => {
    let authorScope;
    let importedScope;
    let appOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      appOutput = helper.fixtures.populateComponents();
      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.exportLane();
      authorScope = helper.scopeHelper.cloneWorkspace();
    });
    describe('merging remote lane into main', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.command.mergeLane(`${helper.scopes.remote}/dev`);
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
        const lanes = helper.command.listLanesParsed();
        const defaultLane = lanes.lanes.find((lane) => lane.name === DEFAULT_LANE);
        expect(defaultLane.components).to.have.lengthOf(3);
      });
      describe('exporting the components to the remote', () => {
        let exportOutput: string;
        before(() => {
          exportOutput = helper.command.export();
        });
        it('should indicate that the components were exported successfully', () => {
          expect(exportOutput).to.not.have.string('nothing to export');
        });
        it('the remote should have the updated component objects', () => {
          const comp1Id = `${helper.scopes.remote}/comp1`;
          const comp1 = helper.command.catComponent(comp1Id);
          const remoteComp1 = helper.command.catComponent(comp1Id, helper.scopes.remotePath);
          expect(remoteComp1).to.have.property('head');
          expect(remoteComp1.head).to.equal(comp1.head);
        });
      });
    });
    describe('merging remote lane into main when components are not in workspace using --workspace flag', () => {
      let mergeOutput;
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        mergeOutput = helper.command.mergeLane(`${helper.scopes.remote}/dev`, `--workspace --verbose`);
      });
      it('should indicate that the components were not merge because they are not in the workspace', () => {
        expect(mergeOutput).to.have.string('merge skipped for the following component(s)');
        expect(mergeOutput).to.have.string('not in the workspace');
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
        const lanes = helper.command.listLanesParsed();
        const defaultLane = lanes.lanes.find((lane) => lane.name === DEFAULT_LANE);
        expect(defaultLane.components).to.have.lengthOf(0);
      });
    });
    // in this case, the lane dev has v1 and v2 on the remote, but only v1 locally.
    // previously, it was needed `bit lane merge` to get v2 locally.
    // currently, it's done by `bit import` and then `bit checkout head`.
    describe('importing a remote lane which is ahead of the local lane', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.command.switchRemoteLane('dev');
        importedScope = helper.scopeHelper.cloneWorkspace();
        helper.scopeHelper.getClonedWorkspace(authorScope);
        helper.fixtures.populateComponents(undefined, undefined, ' v2');
        helper.command.snapAllComponents();
        helper.command.exportLane();

        helper.scopeHelper.getClonedWorkspace(importedScope);
        helper.command.fetchRemoteLane('dev');
      });
      it('bit status should show all components as pending update', () => {
        const status = helper.command.statusJson();
        expect(status.outdatedComponents).to.have.lengthOf(3);
      });
      describe('merging the remote lane', () => {
        before(() => {
          helper.command.checkoutHead();
        });
        it('should save the latest versions from the remote into the local', () => {
          helper.fs.outputFile('app.js', fixtures.appPrintComp1(helper.scopes.remote));
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('comp1 v2 and comp2 v2 and comp3 v2');
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
          const merged = helper.command.listLanes('--merged');
          expect(merged).to.not.have.string('dev');
          expect(merged).to.have.string('None of the lanes is merged');
        });
        it('bit lane --unmerged should show the lane', () => {
          const merged = helper.command.listLanes('--not-merged');
          expect(merged).to.have.string('dev');
          expect(merged).to.not.have.string('All lanes are merged');
        });
      });
    });
    describe('creating a new lane with the same name on a different workspace', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.workspaceJsonc.setupDefault();
        helper.command.createLane('dev');
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFoo();
        helper.command.snapAllComponentsWithoutBuild();
      });
      it('should not merge the two lanes on the remote, instead, it should throw', () => {
        expect(() => helper.command.export()).to.throw('unable to merge');
      });
    });
  });
  describe('merging main into local lane', () => {
    let mergeOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('dev');
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
      mergeOutput = helper.command.mergeLane('main');
    });
    it("should not throw an error that main lane doesn't exist", () => {
      expect(mergeOutput).to.not.have.string('unable to switch to "main", the lane was not found');
    });
  });
  describe('merge main into a lane when it is locally deleted on the lane', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('dev');
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.switchLocalLane('main', '-x');
      helper.command.mergeLane('dev');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.switchLocalLane('dev');
      helper.command.softRemoveOnLane('comp1');
    });
    it('should show a descriptive error explaining why it cannot be merged', () => {
      const cmd = () => helper.command.mergeLane('main', '-x');
      expect(cmd).to.throw('component is locally deleted');
    });
  });
  describe('merging main into local lane when main has tagged versions', () => {
    let mergeOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane('dev');
      helper.fixtures.populateComponents(1, undefined, 'version2');
      helper.command.snapAllComponentsWithoutBuild();
      mergeOutput = helper.command.mergeLane('main');
    });
    it("should not throw an error that main lane doesn't exist", () => {
      expect(mergeOutput).to.not.have.string('getDivergeData: unable to find Version 0.0.1 of comp1');
    });
  });
  describe('merging main when on lane and some workspace components belong to the lane, some belong to main', () => {
    let laneWs: string;
    let headComp1OnLane: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane('dev');
      // add only comp1 to the lane
      helper.command.snapComponentWithoutBuild('comp1', '--unmodified');
      helper.command.export();
      headComp1OnLane = helper.command.getHeadOfLane('dev', 'comp1');
      laneWs = helper.scopeHelper.cloneWorkspace();
      helper.command.switchLocalLane('main', '-x');
      helper.fixtures.populateComponents(2, undefined, 'version2');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
    });
    describe('without --exclude-non-lane-comps flag', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(laneWs);
        helper.command.mergeLane('main', '-x');
      });
      it('should not add non-lane components into the lane', () => {
        const lane = helper.command.showOneLaneParsed('dev');
        expect(lane.components).to.have.lengthOf(1);
      });
      it('should update comp1 on the lane because it is part of the lane', () => {
        const head = helper.command.getHeadOfLane('dev', 'comp1');
        expect(head).to.not.equal(headComp1OnLane);
      });
      it('should update non-lane components in the .bitmap', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.comp2.version).to.equal('0.0.2');
      });
      it('should update the component files in the filesystem for all of them', () => {
        const comp1 = helper.fs.readFile('comp1/index.js');
        expect(comp1).to.have.string('version2');
        const comp2 = helper.fs.readFile('comp2/index.js');
        expect(comp2).to.have.string('version2');
      });
    });
    describe('with --exclude-non-lane-comps flag', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(laneWs);
        helper.command.mergeLane('main', '--exclude-non-lane-comps -x');
      });
      it('should not add non-lane components into the lane', () => {
        const lane = helper.command.showOneLaneParsed('dev');
        expect(lane.components).to.have.lengthOf(1);
      });
      it('should update comp1 on the lane because it is part of the lane', () => {
        const head = helper.command.getHeadOfLane('dev', 'comp1');
        expect(head).to.not.equal(headComp1OnLane);
      });
      it('should not update non-lane components in the .bitmap', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.comp2.version).to.equal('0.0.1');
      });
      it('should update the component files only for lane components', () => {
        const comp1 = helper.fs.readFile('comp1/index.js');
        expect(comp1).to.have.string('version2');
        const comp2 = helper.fs.readFile('comp2/index.js');
        expect(comp2).to.not.have.string('version2');
      });
    });
  });
  describe('merging main lane with no snapped components', () => {
    let mergeOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.createLane('dev');
      mergeOutput = helper.command.mergeLane('main');
    });
    it('should not throw an error about missing objects', () => {
      expect(mergeOutput).to.not.have.string(
        'component comp1 is on the lane but its objects were not found, please re-import the lane'
      );
    });
  });
  describe('merging a lane into main when main is empty', () => {
    let mergeOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.switchLocalLane('main');
      mergeOutput = helper.command.mergeLane('dev');
    });
    it('should not throw an error that head is empty', () => {
      expect(mergeOutput).to.have.string('successfully merged');
    });
    it('the component should be available on main', () => {
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(1);
    });
  });
});
