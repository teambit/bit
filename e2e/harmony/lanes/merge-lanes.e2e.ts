import chai, { expect } from 'chai';
import path from 'path';
import { uniq } from 'lodash';
import { DEFAULT_LANE } from '@teambit/lane-id';
import { Extensions, statusWorkspaceIsCleanMsg } from '../../../src/constants';
import { Helper, fixtures } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('merge lanes', function () {
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      appOutput = helper.fixtures.populateComponents();
      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.exportLane();
      authorScope = helper.scopeHelper.cloneLocalScope();
    });
    describe('merging remote lane into main', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
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
        helper.scopeHelper.reInitLocalScope();
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
        helper.scopeHelper.reInitLocalScope();
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
        helper.scopeHelper.reInitLocalScope();
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane('dev');
      // add only comp1 to the lane
      helper.command.snapComponentWithoutBuild('comp1', '--unmodified');
      helper.command.export();
      headComp1OnLane = helper.command.getHeadOfLane('dev', 'comp1');
      laneWs = helper.scopeHelper.cloneLocalScope();
      helper.command.switchLocalLane('main', '-x');
      helper.fixtures.populateComponents(2, undefined, 'version2');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
    });
    describe('without --exclude-non-lane-comps flag', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(laneWs);
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
        helper.scopeHelper.getClonedLocalScope(laneWs);
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
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
  describe('merge with squash', () => {
    let headOnMain: string;
    let headOnLane: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      headOnMain = helper.command.getHead('comp1');
      helper.command.export();
      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      headOnLane = helper.command.getHeadOfLane('dev', 'comp1');
      // as an intermediate step, verify that it has 4 snaps.
      const log = helper.command.logParsed('comp1');
      expect(log).to.have.lengthOf(4);

      helper.command.switchLocalLane('main');
      helper.command.mergeLane('dev');
    });
    it('should squash the snaps and leave only the last one', () => {
      const log = helper.command.logParsed('comp1');
      expect(log).to.have.lengthOf(2);

      expect(log[0].hash).to.equal(headOnMain);
      expect(log[1].hash).to.equal(headOnLane);
      expect(log[1].parents[0]).to.equal(headOnMain);
    });
  });
  describe('merge with squash when other lane is ahead by only 1 snap, so no need to squash', () => {
    let headOnLane: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      headOnLane = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.switchLocalLane('main');
      helper.command.mergeLane('dev');
    });
    it('should not add the squashed prop into the version object', () => {
      const head = helper.command.catComponent(`comp1@${headOnLane}`);
      expect(head).to.not.have.property('squashed');
      expect(head.modified).to.have.lengthOf(0);
    });
  });
  describe('merge with squash after exporting and importing the lane to a new workspace', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.createLane('dev');
      helper.fixtures.populateComponents(3);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      // headOnLane = helper.command.getHeadOfLane('dev', 'comp1');
      // as an intermediate step, verify that it has 3 snaps.
      const log = helper.command.logParsed('comp1');
      expect(log).to.have.lengthOf(3);
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();

      helper.command.mergeLane(`${helper.scopes.remote}/dev`, '--skip-dependency-installation');
    });
    // previously it was throwing "the component X has no versions and the head is empty"
    it('should be able to run bit-import', () => {
      expect(() => helper.command.import()).not.to.throw();
    });
    it('should show only one snap as staged', () => {
      const staged = helper.command.statusJson().stagedComponents;
      expect(staged[0].versions).to.have.lengthOf(1);
    });
    describe('exporting', () => {
      it('should export with no errors', () => {
        expect(() => helper.command.export()).to.not.throw();
      });
      it('should update the VersionHistory on the remote with the new squash data', () => {
        const versionHistory = helper.command.catVersionHistory(
          `${helper.scopes.remote}/comp1`,
          helper.scopes.remotePath
        );
        const head = helper.command.getHead(`${helper.scopes.remote}/comp1`);
        const headVer = versionHistory.versions.find((v) => v.hash === head);
        expect(headVer.parents).to.have.lengthOf(0);
        expect(headVer.squashed).to.have.lengthOf(1);
      });
    });
  });
  describe('partial merge', () => {
    describe('from a lane to main', () => {
      let comp1HeadOnLane: string;
      let comp2HeadOnLane: string;
      let comp3HeadOnLane: string;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.populateComponents(3);
        helper.command.tagAllWithoutBuild();
        helper.command.export();
        helper.command.createLane();
        helper.fixtures.populateComponents(3, undefined, 'version2');
        helper.command.snapAllComponentsWithoutBuild();
        comp1HeadOnLane = helper.command.getHeadOfLane('dev', 'comp1');
        comp2HeadOnLane = helper.command.getHeadOfLane('dev', 'comp2');
        comp3HeadOnLane = helper.command.getHeadOfLane('dev', 'comp3');
        helper.command.export();
        helper.command.switchLocalLane('main');
      });
      describe('without --include-deps', () => {
        it('should throw an error asking to enter --include-deps flag', () => {
          const mergeFn = () => helper.command.mergeLane('dev', `--pattern ${helper.scopes.remote}/comp2`);
          expect(mergeFn).to.throw('consider adding "--include-deps" flag');
        });
      });
      describe('with --include-deps', () => {
        before(() => {
          helper.command.mergeLane('dev', `--pattern ${helper.scopes.remote}/comp2 --include-deps`);
        });
        it('should not merge components that were not part of the patterns nor part of the pattern dependencies', () => {
          const comp1Head = helper.command.getHead(`${helper.scopes.remote}/comp1`);
          expect(comp1Head).to.not.equal(comp1HeadOnLane);
        });
        it('should merge components that merge the pattern', () => {
          const comp2Head = helper.command.getHead(`${helper.scopes.remote}/comp2`);
          expect(comp2Head).to.equal(comp2HeadOnLane);
        });
        it('should merge components that are dependencies of the given pattern', () => {
          const comp3Head = helper.command.getHead(`${helper.scopes.remote}/comp3`);
          expect(comp3Head).to.equal(comp3HeadOnLane);
        });
      });
    });
  });
  describe('getting updates from main when lane is diverge', () => {
    let workspaceOnLane: string;
    let comp2HeadOnMain: string;
    let beforeMerge: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.populateComponents(2, undefined, 'version2');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      workspaceOnLane = helper.scopeHelper.cloneLocalScope();
      helper.command.switchLocalLane('main');
      helper.fixtures.populateComponents(2, undefined, 'version3');
      helper.command.snapAllComponentsWithoutBuild();
      comp2HeadOnMain = helper.command.getHead(`${helper.scopes.remote}/comp2`);
      helper.command.export();
      helper.scopeHelper.getClonedLocalScope(workspaceOnLane);
      helper.command.import();
      beforeMerge = helper.scopeHelper.cloneLocalScope();
    });
    it('bit import should not bring the latest main objects', () => {
      const head = helper.command.getHead(`${helper.scopes.remote}/comp2`);
      expect(head).to.not.equal(comp2HeadOnMain);
    });
    it('bit status should indicate that the main is ahead', () => {
      const status = helper.command.status('--lanes');
      expect(status).to.have.string(`${helper.scopes.remote}/comp1 ... main is ahead by 1 snaps`);
    });
    let afterMergeToMain: string;
    describe('merging the lane', () => {
      let status;
      before(() => {
        helper.command.mergeLane('main', '--auto-merge-resolve theirs');
        status = helper.command.statusJson();
        afterMergeToMain = helper.scopeHelper.cloneLocalScope();
      });
      it('bit status should show two staging versions, the merge-snap and the one of the original lane because it is new to this lane', () => {
        const stagedVersions = status.stagedComponents.find((c) => c.id === `${helper.scopes.remote}/comp2`);
        expect(stagedVersions.versions).to.have.lengthOf(2);
        expect(stagedVersions.versions).to.include(helper.command.getHeadOfLane('dev', 'comp2'));
      });
      it('bit status should not show the components in pending-merge', () => {
        expect(status.mergePendingComponents).to.have.lengthOf(0);
      });
      describe('switching to main and merging the lane to main without squash', () => {
        before(() => {
          helper.command.switchLocalLane('main');
          helper.command.mergeLane('dev', '--no-squash');
        });
        it('head should have two parents', () => {
          const cat = helper.command.catComponent('comp1@latest');
          expect(cat.parents).to.have.lengthOf(2);
        });
        // previously it was throwing:
        // removeComponentVersions found multiple parents for a local (un-exported) version 368fb583865af40a8823d2ac1d556f4b65582ba2 of iw4j2eko-remote/comp1
        it('bit reset should not throw', () => {
          expect(() => helper.command.resetAll()).to.not.throw();
        });
      });
      describe('switching to main and merging the lane to main (with squash)', () => {
        let beforeMergeHead: string;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(afterMergeToMain);
          helper.command.switchLocalLane('main');
          beforeMergeHead = helper.command.getHead('comp1');
          helper.command.mergeLane('dev');
        });
        it('head should have one parents, which is the previous main head', () => {
          const cat = helper.command.catComponent('comp1@latest');
          expect(cat.parents).to.have.lengthOf(1);
          expect(cat.parents[0]).to.equal(beforeMergeHead);
        });
      });
    });
    describe('merge the lane without snapping', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeMerge);
        helper.command.mergeLane('main', '--auto-merge-resolve theirs --no-snap -x');
      });
      it('should show the during-merge as modified', () => {
        const status = helper.command.statusJson();
        expect(status.modifiedComponents).to.have.lengthOf(2);
      });
      it('bit diff should show the diff between the .bitmap version and the currently merged version', () => {
        const diff = helper.command.diff();
        expect(diff).to.have.string('-module.exports = () => `comp1version2 and ${comp2()}`;'); // eslint-disable-line no-template-curly-in-string
        expect(diff).to.have.string('+module.exports = () => `comp1version3 and ${comp2()}`;'); // eslint-disable-line no-template-curly-in-string
      });
    });
  });
  describe('getting new files when lane is diverge from another lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(1, false, 'version2');
      helper.command.snapComponentWithoutBuild('comp1');
      helper.command.export();
      helper.command.createLane('lane-b');
      helper.fixtures.populateComponents(1, false, 'version3');
      helper.command.snapComponentWithoutBuild('comp1');
      helper.command.export();
      helper.command.switchLocalLane('lane-a');
      helper.fs.outputFile('comp1/new-file.ts');
      helper.command.snapComponentWithoutBuild('comp1');
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importLane('lane-b');
      helper.command.mergeLane(`${helper.scopes.remote}/lane-a`);
    });
    it('should add the newly added file', () => {
      expect(path.join(helper.scopes.localPath, helper.scopes.remote, 'comp1/new-file.ts')).to.be.a.file();
    });
  });
  describe('merge file changes from one lane to another', () => {
    let authorScope;
    let appOutputV2: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents();
      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      authorScope = helper.scopeHelper.cloneLocalScope();
      helper.command.createLane('dev2');
      appOutputV2 = helper.fixtures.populateComponents(undefined, undefined, ' v2');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.getClonedLocalScope(authorScope);
      helper.command.mergeLane(`${helper.scopes.remote}/dev2`);
      helper.command.compile();
    });
    it('should save the latest versions from that lane into the local lane', () => {
      helper.fs.outputFile('app.js', fixtures.appPrintComp1(helper.scopes.remote));
      const result = helper.command.runCmd('node app.js');
      expect(result.trim()).to.equal(appOutputV2);
    });
  });
  describe('multiple scopes when a component in the origin is different than on the lane', () => {
    let originRemote: string;
    let originPath: string;
    let afterLaneExport: string;
    let mainHead: string;
    let laneScopeHead: string;
    let remoteScopeAfterExport: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      originRemote = scopeName;
      originPath = scopePath;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);
      helper.command.createLane();
      helper.workspaceJsonc.addDefaultScope(originRemote);
      helper.fixtures.populateComponents(1, false, 'on-lane');
      helper.command.snapAllComponentsWithoutBuild();
      laneScopeHead = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.export();
      afterLaneExport = helper.scopeHelper.cloneLocalScope();
      remoteScopeAfterExport = helper.scopeHelper.cloneRemoteScope();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.workspaceJsonc.addDefaultScope(originRemote);
      helper.fixtures.populateComponents(1, false, 'on-origin');
      helper.command.tagAllWithoutBuild();
      mainHead = helper.command.getHead('comp1');
      helper.command.export();

      helper.scopeHelper.getClonedLocalScope(afterLaneExport);
      helper.command.import();
    });
    it('bit status should have the component as pendingUpdatesFromMain with an noCommonSnap error', () => {
      const status = helper.command.statusJson(undefined, '--lanes');
      expect(status.pendingUpdatesFromMain).to.have.lengthOf(1);
      expect(status.pendingUpdatesFromMain[0].divergeData.err.name).to.equal('NoCommonSnap');
    });
    describe('bit lane merge without --resolve-unrelated flag', () => {
      it('should throw', () => {
        expect(() => helper.command.mergeLane('main')).to.throw("don't have any snap in common");
      });
    });
    describe('bit lane merge with --resolve-unrelated', () => {
      let mergeOutput: string;
      before(() => {
        mergeOutput = helper.command.mergeLane('main', '--resolve-unrelated');
      });
      it('should merge successfully', () => {
        expect(mergeOutput).to.have.string('successfully merged');
      });
      it('bit status should show the component as staged and not everywhere else', () => {
        helper.command.expectStatusToBeClean(['stagedComponents']);
      });
      it('should not change the file content because the default merge-strategy is "ours"', () => {
        const file = helper.fs.readFile('comp1/index.js');
        expect(file).to.have.string('on-lane');
        expect(file).not.to.have.string('on-origin');
      });
      it('head on lane should point to the main head to preserve the history of the origin', () => {
        const laneHead = helper.command.getHeadOfLane('dev', 'comp1');
        const catObj = helper.command.catComponent(`comp1@${laneHead}`);
        expect(catObj.parents[0]).to.equal(mainHead);
      });
      it('version object should hold a reference for the abandoned component', () => {
        const laneHead = helper.command.getHeadOfLane('dev', 'comp1');
        const catObj = helper.command.catComponent(`comp1@${laneHead}`);
        expect(catObj.unrelated.head).to.equal(laneScopeHead);
      });
      it('should export the component successfully', () => {
        expect(() => helper.command.export()).to.not.throw();
      });
    });
    describe('bit lane merge with --resolve-unrelated and --no-snap', () => {
      before(() => {
        helper.scopeHelper.getClonedRemoteScope(remoteScopeAfterExport);
        helper.scopeHelper.getClonedLocalScope(afterLaneExport);
        helper.command.import();
        helper.command.mergeLane('main', '--resolve-unrelated --no-snap');
      });
      it('bit status should show the component as during-merge and staged and not everywhere else', () => {
        helper.command.expectStatusToBeClean(['componentsDuringMergeState', 'stagedComponents']);
      });
      it('bit import should not throw', () => {
        expect(() => helper.command.import()).not.to.throw();
      });
      describe('snapping the component', () => {
        before(() => {
          helper.command.snapAllComponentsWithoutBuild();
        });
        it('head on lane should point to the main head to preserve the history of the origin', () => {
          const laneHead = helper.command.getHeadOfLane('dev', 'comp1');
          const catObj = helper.command.catComponent(`comp1@${laneHead}`);
          expect(catObj.parents[0]).to.equal(mainHead);
        });
        it('version object should hold a reference for the abandoned component', () => {
          const laneHead = helper.command.getHeadOfLane('dev', 'comp1');
          const catObj = helper.command.catComponent(`comp1@${laneHead}`);
          expect(catObj.unrelated.head).to.equal(laneScopeHead);
        });
        it('should export the component successfully', () => {
          expect(() => helper.command.export()).to.not.throw();
        });
      });
    });
    describe('bit lane merge with --resolve-unrelated and "theirs" merge-strategy', () => {
      before(() => {
        helper.scopeHelper.getClonedRemoteScope(remoteScopeAfterExport);
        helper.scopeHelper.getClonedLocalScope(afterLaneExport);
        helper.command.import();
        helper.command.mergeLane('main', '--resolve-unrelated theirs --no-snap');
      });
      it('bit status should show the component as during-merge and staged and not everywhere else', () => {
        helper.command.expectStatusToBeClean(['componentsDuringMergeState', 'stagedComponents']);
      });
      it('bit import should not throw', () => {
        expect(() => helper.command.import()).not.to.throw();
      });
      it('should not change the file content because the default merge-strategy is "ours"', () => {
        const file = helper.fs.readFile('comp1/index.js');
        expect(file).to.have.string('on-origin');
        expect(file).not.to.have.string('on-lane');
      });
    });
    describe('bit lane merge of another lane that was not resolved yet', () => {
      let laneHeadAfterMerge: string;
      let beforeMergingSecondLane: string;
      before(() => {
        helper.scopeHelper.getClonedRemoteScope(remoteScopeAfterExport);
        helper.scopeHelper.getClonedLocalScope(afterLaneExport);
        helper.command.createLane('dev2', `--remote-scope ${helper.scopes.remote}`);
        helper.command.snapAllComponentsWithoutBuild('--unmodified');
        helper.command.export();
        helper.command.switchLocalLane('dev');
        helper.command.import();
        helper.command.mergeLane('main', '--resolve-unrelated');
        laneHeadAfterMerge = helper.command.getHeadOfLane('dev', 'comp1');
        helper.command.export();
        beforeMergingSecondLane = helper.scopeHelper.cloneLocalScope();
        helper.command.mergeLane('dev2', '--resolve-unrelated');
      });
      it('should keep the local history and not the dev2 history because the current history has been already resolved', () => {
        const log = helper.command.logParsed('comp1');
        const hashesInHistory = log.map((item) => item.hash);
        expect(hashesInHistory).to.include(mainHead);
        expect(hashesInHistory).to.include(laneHeadAfterMerge);
      });
      it('bit status should not show components as pendingUpdatesFromMain', () => {
        const status = helper.command.statusJson();
        expect(status.pendingUpdatesFromMain).to.have.lengthOf(0);
      });
      // it's a complex scenario. in short:
      // main has 0.0.1 and 0.0.2
      // dev lane resolved unrelated when main was on 0.0.1
      // now when merging dev to dev2, the component-head (0.0.2) can't be found in the local-snaps of dev
      describe('when main got another tag meanwhile', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope(originPath);
          helper.command.import(`${originRemote}/comp1`);
          helper.command.tagAllWithoutBuild('--unmodified');
          helper.command.export();

          helper.scopeHelper.getClonedLocalScope(beforeMergingSecondLane);
          helper.command.import();
        });
        it('should be able to merge with no errors', () => {
          expect(() => helper.command.mergeLane('dev2', '--resolve-unrelated')).to.not.throw();
        });
      });
    });
    describe('switching to main and checking out to head', () => {
      before(() => {
        helper.scopeHelper.getClonedRemoteScope(remoteScopeAfterExport);
        helper.scopeHelper.getClonedLocalScope(afterLaneExport);
        helper.command.switchLocalLane('main', '-x');
        helper.command.checkoutHead('comp1', '-x');
      });
      it('should make the component available and checkout to main version', () => {
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(1);
        // it can be 0.0.1 or 0.0.2 depends when the ".only" is, but it doesn't matter.
        // all we want here is to make sure it's a tag, not a snap.
        expect(list[0].localVersion.startsWith('0.0')).to.be.true;
        expect(list[0].currentVersion.startsWith('0.0')).to.be.true;
      });
    });
    describe('bit lane merge after soft-removed the unrelated component', () => {
      before(() => {
        helper.scopeHelper.getClonedRemoteScope(remoteScopeAfterExport);
        helper.scopeHelper.getClonedLocalScope(afterLaneExport);
        helper.command.import();
        helper.command.softRemoveOnLane('comp1');
        helper.command.snapAllComponentsWithoutBuild();
        helper.command.export();
      });
      it('should not throw', () => {
        expect(() => helper.command.mergeLane('main')).to.not.throw();
      });
    });
    // dev: snapA -> export -> snapB -> snapC -> merge-snap.
    // main: snapMain.
    describe('when the resolved unrelated is not a direct parent', () => {
      before(() => {
        helper.scopeHelper.getClonedRemoteScope(remoteScopeAfterExport);
        helper.scopeHelper.getClonedLocalScope(afterLaneExport);
        helper.command.import();
        helper.command.snapAllComponentsWithoutBuild('--unmodified');
        helper.command.snapAllComponentsWithoutBuild('--unmodified');
        helper.command.mergeLane('main', '--resolve-unrelated -x');
      });
      // previously, this was throwing NoCommonSnap error, because getDivergeData was comparing the remote-lane-head
      // (snapA) with the current merge-snap. The current merge-snap has one parent - head of main. The remote-lane-head has
      // history of the lane only (snapA). The traversal has source-hash (merge-snap) and target-hash (snapA).
      // 1. start from source-hash, you get merge-snap and its parent snapMain. and the immediate unrelated, snapC. target was not found.
      // 2. start from target-hash, you get snapA only, source was not found.
      // it is fixed by traversing the unrelated. as a result, #1 includes not only snapC, but also snapB and snapA.
      it('bit status should not throw', () => {
        expect(() => helper.command.status()).to.not.throw();
      });
    });
  });
  describe('multiple scopes when a component in the origin is different than on the lane and the lane is forked', () => {
    let originRemote: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      originRemote = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);
      helper.command.createLane('lane-a');
      helper.workspaceJsonc.addDefaultScope(originRemote);
      helper.fixtures.populateComponents(1, false, 'on-lane');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.command.createLane('lane-b');
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.mergeLane('lane-a', '-x');
    });
    it('should not throw during bit-import because it tries to import comp1 from the original scope instead of the lane scope', () => {
      expect(() => helper.command.import()).to.not.throw();
    });
  });
  describe('merge unrelated between two lanes with --resolve-unrelated', () => {
    let headOnLaneA: string;
    let headOnLaneB: string;
    let beforeMerge: string;
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(1, false, 'lane-a');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      headOnLaneA = helper.command.getHeadOfLane('lane-a', 'comp1');

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.createLane('lane-b');
      helper.fixtures.populateComponents(1, false, 'lane-b');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      headOnLaneB = helper.command.getHeadOfLane('lane-b', 'comp1');
      beforeMerge = helper.scopeHelper.cloneLocalScope();
    });
    describe('without specifying strategy, which defaults to "ours"', () => {
      before(() => {
        helper.command.mergeLane('lane-a', '--resolve-unrelated -x');
      });
      it('should resolve by default by ours', () => {
        const fileContent = helper.fs.readFile('comp1/index.js');
        expect(fileContent).to.have.string('lane-b');
        expect(fileContent).to.not.have.string('lane-a');
      });
      it('should populate the unrelated property correctly on the Version object', () => {
        const ver = helper.command.catComponent('comp1@latest');
        expect(ver.unrelated.head).to.equal(headOnLaneA);
        expect(ver.unrelated.laneId.name).to.equal('lane-a');
      });
      it('should populate the parents according to the current lane', () => {
        const ver = helper.command.catComponent('comp1@latest');
        expect(ver.parents[0]).to.equal(headOnLaneB);
      });
    });
    describe('with strategy theirs', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeMerge);
        helper.command.mergeLane('lane-a', '--resolve-unrelated=theirs -x');
      });
      it('should get the file content according to their', () => {
        const fileContent = helper.fs.readFile('comp1/index.js');
        expect(fileContent).to.have.string('lane-a');
        expect(fileContent).to.not.have.string('lane-b');
      });
      it('should populate the unrelated property correctly on the Version object', () => {
        const ver = helper.command.catComponent('comp1@latest');
        expect(ver.unrelated.head).to.equal(headOnLaneB);
        expect(ver.unrelated.laneId.name).to.equal('lane-b');
      });
      it('should populate the parents according to the other lane', () => {
        const ver = helper.command.catComponent('comp1@latest');
        expect(ver.parents[0]).to.equal(headOnLaneA);
      });
    });
  });
  describe('merge lanes when local-lane has soft-removed components and the other lane is behind', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane('dev2');
      helper.command.snapComponentWithoutBuild('comp1', '--unmodified');
      helper.command.export();
      helper.command.switchLocalLane('dev');
      helper.command.softRemoveOnLane('comp2');
      helper.fs.outputFile('comp1/index.js', '');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.mergeLane('dev2');
    });
    it('should not bring the removed components', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.not.have.property('comp2');
    });
  });
  describe('merge lanes when local-lane has soft-removed components and the other lane is diverge', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane('dev2');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.switchLocalLane('dev');
      helper.command.softRemoveOnLane('comp2');
      helper.fs.outputFile('comp1/index.js', '');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.mergeLane('dev2');
    });
    // made a decision (according to Ran) to not merge the component in this case.
    it.skip('should bring the removed component because it may have changed and these changes are needed for other components', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('comp2');
    });
    it.skip('should show the removed components as remotelySoftRemoved because of the merge-config mechanism', () => {
      const status = helper.command.statusJson();
      expect(status.remotelySoftRemoved).to.have.lengthOf(1);
      expect(status.remotelySoftRemoved[0]).to.include('comp2');
    });
    it('bit log should not show duplications', () => {
      const log = helper.command.logParsed('comp2');
      const hashes = log.map((logEntry) => logEntry.hash);
      expect(hashes.length).to.equal(uniq(hashes).length);
    });
  });
  describe('merge a diverged lane into main with --tag', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.switchLocalLane('main');
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.mergeLane('dev', '--no-squash --tag');
    });
    it('should merge-tag instead of merge-snap', () => {
      const cmp = helper.command.catComponent('comp1');
      expect(cmp.versions).to.have.property('0.0.3');
      expect(cmp.versions['0.0.3']).to.equal(cmp.head);
    });
    it('expect head to have two parents', () => {
      const headVer = helper.command.catComponent('comp1@latest');
      expect(headVer.parents).to.have.lengthOf(2);
    });
  });
  describe('auto-snap during merge when the snap is failing', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.switchLocalLane('main');
      helper.command.tagAllWithoutBuild('--unmodified');
      // this will fail the build
      helper.command.dependenciesSet('comp1', 'non-exist-pkg@123.123.123');
      helper.command.mergeLane('dev', '--no-squash --ignore-config-changes --build');
    });
    // previous bug was writing the .bitmap at the end with the failed version
    it('should not change the .bitmap with the failed-snap version', () => {
      const bitmap = helper.bitMap.read();
      expect(bitmap.comp1.version).to.equal('0.0.2');
    });
  });
  describe('merge lane with comp-1 to an empty lane with .bitmap has the component', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.switchLocalLane('main');
      helper.command.createLane('dev2');
      helper.command.mergeLane('dev');
    });
    it('should merge', () => {
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(1);
    });
  });
  describe('merge from main when a component head is a tag on main and was not changed on lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.createLane();
      helper.fixtures.populateComponents(3);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.switchLocalLane('main', '-x');
      helper.command.mergeLane('dev', '-x');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.switchLocalLane('dev', '-x');
      helper.command.mergeLane('main', '-x');
    });
    // previously, it was throwing an error
    // id o5kaxkjd-remote/comp1@0.0.1 exists in flattenedEdges but not in flattened of o5kaxkjd-remote/comp1@6f820556b472253cd08331b20e704fe74217fd31
    it('bit status should not throw', () => {
      expect(() => helper.command.status()).to.not.throw();
    });
  });
  describe('conflict when the same file exist in base, deleted on the lane and modified on main', () => {
    const conflictedFilePath = 'comp1/foo.js';
    let beforeMerge: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);

      helper.fs.outputFile(conflictedFilePath);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.command.createLane();
      helper.fs.deletePath(conflictedFilePath);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.switchLocalLane('main', '-x');
      helper.fs.outputFile(conflictedFilePath, 'console.log("hello")');
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      beforeMerge = helper.scopeHelper.cloneLocalScope();
    });
    describe('when the lane is merged to main, so currently on the FS the file exits', () => {
      before(() => {
        helper.command.mergeLane('dev', '--no-squash --no-snap -x');
      });
      // previously the file was removed
      it('should not remove the file', () => {
        expect(path.join(helper.scopes.localPath, conflictedFilePath)).to.be.a.file();
      });
    });
    describe('when main is merged to the lane, so currently on the FS the file is removed', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeMerge);
        helper.command.switchLocalLane('dev', '-x');
        helper.command.mergeLane('main', '--no-snap -x');
      });
      // previously it was in "remain-deleted" state and the file was not created
      it('should add the file', () => {
        expect(path.join(helper.scopes.localPath, conflictedFilePath)).to.be.a.file();
      });
    });
  });
  describe('merging from a lane to main when it changed Version object with squashed property and then re-imported it', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.snapComponentWithoutBuild(
        `"${helper.scopes.remote}/comp1, ${helper.scopes.remote}/comp2"`,
        '--unmodified'
      );
      helper.command.snapComponentWithoutBuild(
        `"${helper.scopes.remote}/comp1, ${helper.scopes.remote}/comp2"`,
        '--unmodified'
      );
      helper.command.snapComponentWithoutBuild(
        `"${helper.scopes.remote}/comp1, ${helper.scopes.remote}/comp2"`,
        '--unmodified'
      );
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.mergeLane(`${helper.scopes.remote}/dev`, `-x`);
      const head = helper.command.getHead(`${helper.scopes.remote}/comp1`);
      // because comp3 is missing, this will re-fetch comp1 with all its dependencies, which could potentially override the version objects
      helper.command.import(`${helper.scopes.remote}/comp1@${head} --objects --fetch-deps`);
    });
    it('should not override the squashed property', () => {
      const comp = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`);
      expect(comp).to.have.property('squashed');
      expect(comp.modified).to.have.lengthOf(1);
    });
    it('bit export should not throw', () => {
      expect(() => helper.command.export()).to.not.throw();
    });
  });
  describe('merging from a lane to main when it has a long history which does not exist locally', () => {
    let beforeMerge: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents();
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('comp3');
      beforeMerge = helper.scopeHelper.cloneLocalScope();
    });
    describe('merging one component', () => {
      // previously it was throwing VersionNotFound
      it('should not throw', () => {
        expect(() =>
          helper.command.mergeLane(`${helper.scopes.remote}/dev`, `${helper.scopes.remote}/comp3 --no-squash -x`)
        ).to.not.throw();
      });
    });
    describe('merging the entire lane', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeMerge);
        helper.command.mergeLane(`${helper.scopes.remote}/dev`, `--no-squash -x`);
      });
      // previously it was throwing VersionNotFound
      it('bit export should not throw', () => {
        expect(() => helper.command.export()).to.not.throw();
      });
    });
  });
  describe('merge introduces a new component to a lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-b');
      helper.fixtures.populateComponents(2);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.switchLocalLane('lane-a', '-x');
      helper.command.mergeLane('lane-b', '-x');
      helper.command.export();
    });
    // previous bug was ignoring the new component on the remote during export because the snap was already on the remote.
    // as a result, the lane-object on the remote didn't have this comp2 component.
    it('should update the remote lane with the newly merged component', () => {
      const lane = helper.command.catLane('lane-a', helper.scopes.remotePath);
      expect(lane.components).to.have.lengthOf(2);
    });
  });
  describe('merge from main when on a forked-new-lane from another scope', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      const anotherRemote = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);

      helper.fixtures.populateComponents(1, false);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      const mainWs = helper.scopeHelper.cloneLocalScope();

      helper.workspaceJsonc.addDefaultScope(anotherRemote);
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.createLane('lane-b');
      const laneBWs = helper.scopeHelper.cloneLocalScope();

      helper.scopeHelper.getClonedLocalScope(mainWs);
      helper.command.mergeLane(`${anotherRemote}/lane-a`, '-x');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();

      helper.scopeHelper.getClonedLocalScope(laneBWs);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.mergeLane(`main ${helper.scopes.remote}/comp1`, '-x');
    });
    it('should not throw ComponentNotFound on export', () => {
      expect(() => helper.command.export()).to.not.throw();
    });
  });
  describe('merge an out-of-date component from another lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      const mainScope = helper.scopeHelper.cloneLocalScope();
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.scopeHelper.getClonedLocalScope(mainScope);
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.createLane('lane-b');
      helper.command.mergeLane(`${helper.scopes.remote}/lane-a`, '-x');

      // @todo: fix. currently, it throws an error about missing version
      helper.command.importComponent('comp1', '--all-history --objects');
    });
    it('should not show the component as pending-merge', () => {
      const status = helper.command.statusJson();
      expect(status.mergePendingComponents).to.have.lengthOf(0);
    });
  });
  describe('merge from one lane to another with --squash', () => {
    let previousSnapLaneB: string;
    let headLaneB: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-b');
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // should not be part of the history
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      previousSnapLaneB = helper.command.getHeadOfLane('lane-b', 'comp1');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      headLaneB = helper.command.getHeadOfLane('lane-b', 'comp1');
      helper.command.export();
      helper.command.switchLocalLane('lane-a', '-x');
      helper.command.mergeLane('lane-b', '--squash -x');
    });
    it('bit log should not include previous versions from lane-b', () => {
      const log = helper.command.log('comp1');
      expect(log).to.not.have.string(previousSnapLaneB);
    });
    it('Version object should include the squash data', () => {
      const headVersion = helper.command.catComponent(`${helper.scopes.remote}/comp1@${headLaneB}`);
      expect(headVersion).to.have.property('squashed');
      expect(headVersion.squashed).to.have.property('laneId');
      expect(headVersion.squashed.laneId.name).to.equal('lane-b');
      expect(headVersion.squashed.previousParents).to.have.lengthOf(1);
      expect(headVersion.squashed.previousParents[0]).to.equal(previousSnapLaneB);
    });
  });
  describe('merge from one lane to another with --squash when it has history in main', () => {
    let mainHead: string;
    let previousSnapLaneA: string;
    let headLaneB: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.tagAllWithoutBuild();
      mainHead = helper.command.getHead('comp1');
      helper.command.export();
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // should not be part of the history
      previousSnapLaneA = helper.command.getHeadOfLane('lane-a', 'comp1');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.createLane('lane-b');
      helper.command.mergeLane(`${helper.scopes.remote}/lane-a`, '--squash -x');
      headLaneB = helper.command.getHeadOfLane('lane-b', 'comp1');
    });
    // previously it was throwing NoCommonSnap error
    it('bit status should not throw', () => {
      expect(() => helper.command.status()).to.not.throw();
    });
    it('Version object should have the main head as the parent', () => {
      const headVersion = helper.command.catComponent(`${helper.scopes.remote}/comp1@${headLaneB}`);
      expect(headVersion.parents).to.have.lengthOf(1);
      expect(headVersion.parents[0]).to.equal(mainHead);
      expect(headVersion.squashed.laneId.name).to.equal('lane-a');
      expect(headVersion.squashed.previousParents).to.have.lengthOf(1);
      expect(headVersion.squashed.previousParents[0]).to.equal(previousSnapLaneA);
    });
    it('Version object should include the squash data', () => {
      const headVersion = helper.command.catComponent(`${helper.scopes.remote}/comp1@${headLaneB}`);
      expect(headVersion).to.have.property('squashed');
      expect(headVersion.squashed).to.have.property('laneId');
      expect(headVersion.squashed.laneId.name).to.equal('lane-a');
      expect(headVersion.squashed.previousParents).to.have.lengthOf(1);
      expect(headVersion.squashed.previousParents[0]).to.equal(previousSnapLaneA);
    });
  });
  describe('when a file was deleted on the other lane but exist current and on the base', () => {
    let mergeOutput: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.fs.outputFile('comp1/foo.js');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-a');
      helper.fs.deletePath('comp1/foo.js');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.switchLocalLane('main', '-x');
      mergeOutput = helper.command.mergeLane('lane-a', '-x --no-snap');
    });
    it('should indicate that this file was removed in the output', () => {
      expect(mergeOutput).to.have.string('removed foo.js');
    });
    it('should remove this file from the filesystem ', () => {
      expect(path.join(helper.scopes.localPath, 'comp1/foo.js')).to.not.be.a.path();
    });
  });
  describe('when a file was deleted on the other lane but exist current and on the base and both lanes are diverged', () => {
    let mergeOutput: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.fs.outputFile('comp1/foo.js');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-a');
      helper.fs.deletePath('comp1/foo.js');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.switchLocalLane('main', '-x');
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();
      mergeOutput = helper.command.mergeLane('lane-a', '-x --no-snap --no-squash');
    });
    it('should indicate that this file was removed in the output', () => {
      expect(mergeOutput).to.have.string('removed foo.js');
    });
    it('should remove this file from the filesystem ', () => {
      expect(path.join(helper.scopes.localPath, 'comp1/foo.js')).to.not.be.a.path();
    });
  });
  describe('naming conflict introduced during the merge', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-b');
      helper.fs.outputFile('comp1-foo/index.ts');
      helper.command.addComponent('comp1-foo', '--id comp1/foo');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importLane('lane-a');
    });
    it('should merge without error by prefix "_1" to the dir-name', () => {
      expect(() => helper.command.mergeLane(`${helper.scopes.remote}/lane-b`, '-x')).to.not.throw();
      const dir = path.join(helper.scopes.localPath, helper.scopes.remote, 'comp1_1');
      expect(dir).to.be.a.directory();
    });
  });
  // the idea here is that main-head doesn't exist in lane-b history.
  // the history between main and lane-b is connected through the "squashed" property of HEAD^1 (main head minus one),
  // which is equal to HEAD-LANE-B^1.
  describe('merge lane-a to main with squashing then from main to lane-b which forked from lane-a', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-b');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.switchLocalLane('lane-a', '-x');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.switchLocalLane('main', '-x');
      helper.command.mergeLane('lane-a', '-x');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.switchLocalLane('lane-b', '-x');
    });
    // previously it was throwing the "unrelated" error
    it('bit-lane-merge should not throw', () => {
      expect(() => helper.command.mergeLane('main', '-x --no-snap')).to.not.throw();
    });
  });
  describe('renaming files from uppercase to lowercase', () => {
    let afterExport: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.createLane('lane-a');
      helper.fs.outputFile('comp1/Foo.js');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.createLane('lane-b');
      helper.fs.deletePath('comp1/Foo.js');
      helper.fs.outputFile('comp1/foo.js');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      afterExport = helper.scopeHelper.cloneLocalScope();
    });
    describe('merging', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importLane('lane-a', '-x');
        helper.command.mergeLane('lane-b', '-x');
      });
      it('should get the rename from the other lane', () => {
        const file = path.join(helper.scopes.remote, 'comp1/foo.js');
        helper.fs.expectFileToExist(file);
      });
    });
    describe('switching', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(afterExport);
        helper.command.switchLocalLane('lane-a', '-x');
      });
      it('should remove the file from the current lane and write the file according to the switch-to lane', () => {
        helper.fs.expectFileToExist('comp1/Foo.js');
      });
    });
  });
  describe('multiple files, some are not changes', () => {
    let switchOutput: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(1, false);
      helper.fs.outputFile('comp1/foo.js');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-b');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();

      switchOutput = helper.command.switchLocalLane('lane-a', '-x');
    });
    it('expect to have all files as unchanged, not updated', () => {
      expect(switchOutput).to.not.have.string('updated');
    });
    describe('merge the lane', () => {
      let mergeOutput: string;
      before(() => {
        mergeOutput = helper.command.mergeLane('lane-b', '-x');
      });
      it('expect to have all files as unchanged, not updated', () => {
        expect(mergeOutput).to.not.have.string('updated');
      });
    });
  });
  describe('merging from main when main is ahead so then a snap of an existing tag is in .bitmap', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.switchLocalLane('main', '-x');
      helper.command.mergeLane('lane-a', '-x');
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.switchLocalLane('lane-a', '-x');
      helper.command.mergeLane('main', '-x');
    });
    it('bit status should not show the component as modified', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponents).to.have.lengthOf(0);
    });
    it('the dependency should use the tag not the snap', () => {
      const dep = helper.command.getCompDepsIdsFromData('comp1');
      expect(dep[0]).to.equal(`${helper.scopes.remote}/comp2@0.0.2`);
    });
    describe('snapping the dependent', () => {
      before(() => {
        helper.command.snapComponentWithoutBuild('comp1');
      });
      it('should save the dependency with tag, not snap', () => {
        const comp1 = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`);
        expect(comp1.dependencies[0].id.version).to.equal('0.0.2');
        expect(comp1.flattenedDependencies[0].version).to.equal('0.0.2');
        const depResolver = comp1.extensions.find((e) => e.name === Extensions.dependencyResolver);
        const dep = depResolver.data.dependencies.find((d) => d.id.includes('comp2'));
        expect(dep.version).to.equal('0.0.2');
      });
    });
  });
  describe('when a file exists in local and others but not in base', () => {
    let mainWs: string;
    let mergeOutput: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      mainWs = helper.scopeHelper.cloneLocalScope();

      helper.command.createLane();
      helper.fs.outputFile('comp1/foo.js', 'on-lane');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.getClonedLocalScope(mainWs);
      helper.fs.outputFile('comp1/foo.js', 'on-main');
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      mergeOutput = helper.command.mergeLane('dev', '-x --no-squash --auto-merge-resolve=manual');
    });
    // previously in this case, it was marking it as "overridden" and was leaving the content as it was in the filesystem.
    it('should write the file with the conflicts', () => {
      expect(mergeOutput).to.include('CONFLICT');
      const foo = helper.fs.readFile('comp1/foo.js');
      expect(foo).to.include('<<<<<<<');
    });
  });
  describe('merging lane with a component newly introduced where it was a package before', () => {
    let laneAWs: string;
    let comp2PkgName: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      laneAWs = helper.scopeHelper.cloneLocalScope();
      helper.command.switchLocalLane('main');
      helper.command.mergeLane('lane-a', '-x');
      helper.command.export();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-b');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      comp2PkgName = helper.general.getPackageNameByCompName('comp2', false);
      helper.scopeHelper.getClonedLocalScope(laneAWs);
      helper.npm.addFakeNpmPackage(comp2PkgName, '0.0.1');
      helper.workspaceJsonc.addPolicyToDependencyResolver({ dependencies: { [comp2PkgName]: '0.0.1' } });
    });
    it('should remove the package from workspace.jsonc', () => {
      helper.command.mergeLane('lane-b', '-x');
      const policy = helper.workspaceJsonc.getPolicyFromDependencyResolver();
      expect(policy.dependencies).to.not.have.property(comp2PkgName);
    });
  });
  describe('bit lane merge-move command', () => {
    let oldSnapComp1: string;
    let snapComp2: string;
    let newSnapComp1: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.populateComponents(3, true, 'on-lane');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.switchLocalLane('main', '-x');
      helper.fixtures.populateComponents(3, true, 'on-main');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.switchLocalLane('dev', '-x');
      helper.command.mergeLane('main', '-x --manual');
      helper.fixtures.populateComponents(3, true, 'fixed-conflicts');
      oldSnapComp1 = helper.command.getHeadOfLane('dev', 'comp1');
      snapComp2 = helper.command.getHeadOfLane('dev', 'comp2');
      helper.command.snapComponentWithoutBuild('comp1');
      newSnapComp1 = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.mergeMoveLane('new-lane');
    });
    it('should create a new lane', () => {
      const lanes = helper.command.listLanesParsed();
      expect(lanes.currentLane).to.equal('new-lane');
    });
    it('the new lane should have the new local snaps created on the original lane', () => {
      const lane = helper.command.catLane('new-lane');
      expect(lane.components).to.have.lengthOf(3);
      const comp1 = lane.components.find((c) => c.id.name === 'comp1');
      expect(comp1.head).to.equal(newSnapComp1);
    });
    it('the new lane should have the same components as the original lane', () => {
      const lane = helper.command.catLane('new-lane');
      const comp2 = lane.components.find((c) => c.id.name === 'comp2');
      expect(comp2.head).to.equal(snapComp2);
    });
    it('the filesystem should stay the same', () => {
      const comp1 = helper.fs.readFile(`comp1/index.js`);
      expect(comp1).to.have.string('fixed-conflicts');
      const comp2 = helper.fs.readFile(`comp2/index.js`);
      expect(comp2).to.have.string('fixed-conflicts');
    });
    it('the original lane should be reverted to the before-merge state', () => {
      const lane = helper.command.catLane('dev');
      const comp1 = lane.components.find((c) => c.id.name === 'comp1');
      expect(comp1.head).to.equal(oldSnapComp1);
    });
  });
});
