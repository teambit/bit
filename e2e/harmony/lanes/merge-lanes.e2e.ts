import chai, { expect } from 'chai';
import path from 'path';
import { uniq } from 'lodash';
import { DEFAULT_LANE } from '@teambit/lane-id';
import { statusWorkspaceIsCleanMsg } from '../../../src/constants';
import Helper from '../../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../../src/fixtures/fixtures';

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
        expect(mergeOutput).to.have.string('the merge has been skipped on the following component(s)');
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
        helper.bitJsonc.setupDefault();
        helper.command.createLane('dev');
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFooAsDir();
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
  describe('merging main into local lane when main has tagged versions', () => {
    let mergeOutput: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane('dev');
      helper.fixtures.populateComponents(1, undefined, 'v2');
      helper.command.snapAllComponentsWithoutBuild();
      mergeOutput = helper.command.mergeLane('main');
    });
    it("should not throw an error that main lane doesn't exist", () => {
      expect(mergeOutput).to.not.have.string('getDivergeData: unable to find Version 0.0.1 of comp1');
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
        helper.fixtures.populateComponents(3, undefined, 'v2');
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
          expect(mergeFn).to.throw(
            'the following dependencies which were not included in the pattern. consider adding "--include-deps" flag'
          );
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
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.populateComponents(2, undefined, 'v2');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      workspaceOnLane = helper.scopeHelper.cloneLocalScope();
      helper.command.switchLocalLane('main');
      helper.fixtures.populateComponents(2, undefined, 'v3');
      helper.command.snapAllComponentsWithoutBuild();
      comp2HeadOnMain = helper.command.getHead(`${helper.scopes.remote}/comp2`);
      helper.command.export();
      helper.scopeHelper.getClonedLocalScope(workspaceOnLane);
      helper.command.import();
    });
    it('bit import should bring the latest main objects', () => {
      const head = helper.command.getHead(`${helper.scopes.remote}/comp2`);
      expect(head).to.equal(comp2HeadOnMain);
    });
    it('bit status should indicate that the main is ahead', () => {
      const status = helper.command.status('--lanes');
      expect(status).to.have.string(`${helper.scopes.remote}/comp1 ... main is ahead by 1 snaps`);
    });
    let afterMergeToMain: string;
    describe('merging the lane', () => {
      let status;
      before(() => {
        helper.command.mergeLane('main', '--theirs');
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
          expect(() => helper.command.untagAll()).to.not.throw();
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
  });
  describe('getting new files when lane is diverge from another lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(1, false, 'v2');
      helper.command.snapComponentWithoutBuild('comp1');
      helper.command.export();
      helper.command.createLane('lane-b');
      helper.fixtures.populateComponents(1, false, 'v3');
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
      helper.bitJsonc.addDefaultScope(originRemote);
      helper.fixtures.populateComponents(1, false, 'on-lane');
      helper.command.snapAllComponentsWithoutBuild();
      laneScopeHead = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.export();
      afterLaneExport = helper.scopeHelper.cloneLocalScope();
      remoteScopeAfterExport = helper.scopeHelper.cloneRemoteScope();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.bitJsonc.addDefaultScope(originRemote);
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
        expect(mergeOutput).to.have.string('successfully merged components');
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
    describe('bit lane merge after soft-removed the unrelated component', () => {
      before(() => {
        helper.scopeHelper.getClonedRemoteScope(remoteScopeAfterExport);
        helper.scopeHelper.getClonedLocalScope(afterLaneExport);
        helper.command.import();
        helper.command.removeComponent('comp1', '--soft');
        helper.command.snapAllComponentsWithoutBuild();
        helper.command.export();
      });
      it('should not throw', () => {
        expect(() => helper.command.mergeLane('main')).to.not.throw();
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
      helper.command.removeComponent('comp2', '--soft');
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
      helper.command.removeComponent('comp2', '--soft');
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
  describe('merge from scope lane to main (squash)', () => {
    let bareMerge;
    let comp1HeadOnLane: string;
    let comp2HeadOnLane: string;
    let comp2PreviousHeadOnLane: string;
    let comp2HeadOnMain: string;
    let beforeMerging: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagWithoutBuild('comp2');
      comp2HeadOnMain = helper.command.getHead('comp2');
      helper.command.export();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      comp2PreviousHeadOnLane = helper.command.getHeadOfLane('dev', 'comp2');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      comp1HeadOnLane = helper.command.getHeadOfLane('dev', 'comp1');
      comp2HeadOnLane = helper.command.getHeadOfLane('dev', 'comp2');
      helper.command.export();
      bareMerge = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareMerge.scopePath);
      beforeMerging = helper.scopeHelper.cloneScope(bareMerge.scopePath);
      helper.command.mergeLaneFromScope(bareMerge.scopePath, `${helper.scopes.remote}/dev`);
    });
    it('should merge to main', () => {
      expect(helper.command.getHead(`${helper.scopes.remote}/comp1`, bareMerge.scopePath)).to.equal(comp1HeadOnLane);
      expect(helper.command.getHead(`${helper.scopes.remote}/comp2`, bareMerge.scopePath)).to.equal(comp2HeadOnLane);
    });
    it('should squash by default', () => {
      const cat = helper.command.catComponent(`${helper.scopes.remote}/comp2@latest`, bareMerge.scopePath);
      expect(cat.parents).to.have.lengthOf(1);
      const parent = cat.parents[0];
      expect(parent).to.not.equal(comp2PreviousHeadOnLane);
      expect(parent).to.equal(comp2HeadOnMain);
    });
    it('should not export by default', () => {
      const comp1OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp1`, bareMerge.scopePath);
      const comp1OnRemote = helper.command.catComponent(`${helper.scopes.remote}/comp1`, helper.scopes.remotePath);
      expect(comp1OnBare.head).to.not.equal(comp1OnRemote.head);

      const comp2OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp2`, bareMerge.scopePath);
      const comp2OnRemote = helper.command.catComponent(`${helper.scopes.remote}/comp2`, helper.scopes.remotePath);
      expect(comp2OnBare.head).to.not.equal(comp2OnRemote.head);
    });
    describe('running with --push flag', () => {
      before(() => {
        helper.scopeHelper.getClonedScope(beforeMerging, bareMerge.scopePath);
        helper.command.mergeLaneFromScope(bareMerge.scopePath, `${helper.scopes.remote}/dev`, '--push');
      });
      it('should export the modified components to the remote', () => {
        const comp1OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp1`, bareMerge.scopePath);
        const comp1OnRemote = helper.command.catComponent(`${helper.scopes.remote}/comp1`, helper.scopes.remotePath);
        expect(comp1OnBare.head).to.equal(comp1OnRemote.head);

        const comp2OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp2`, bareMerge.scopePath);
        const comp2OnRemote = helper.command.catComponent(`${helper.scopes.remote}/comp2`, helper.scopes.remotePath);
        expect(comp2OnBare.head).to.equal(comp2OnRemote.head);
      });
    });
  });
  describe('merge from scope lane to another lane (no squash)', () => {
    let bareMerge;
    let comp1HeadOnLaneB: string;
    let comp2HeadOnLaneB: string;
    let comp2PreviousHeadOnLaneB: string;
    let comp2HeadOnLaneA: string;
    let beforeMerging: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.createLane('lane-a');
      helper.command.snapComponentWithoutBuild('comp2');
      comp2HeadOnLaneA = helper.command.getHeadOfLane('lane-a', 'comp2');
      helper.command.export();

      helper.command.createLane('lane-b');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      comp2PreviousHeadOnLaneB = helper.command.getHeadOfLane('lane-b', 'comp2');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      comp1HeadOnLaneB = helper.command.getHeadOfLane('lane-b', 'comp1');
      comp2HeadOnLaneB = helper.command.getHeadOfLane('lane-b', 'comp2');
      helper.command.export();
      bareMerge = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareMerge.scopePath);
      beforeMerging = helper.scopeHelper.cloneScope(bareMerge.scopePath);
      helper.command.mergeLaneFromScope(
        bareMerge.scopePath,
        `${helper.scopes.remote}/lane-b`,
        `${helper.scopes.remote}/lane-a`
      );
    });
    it('should merge to lane-a', () => {
      expect(helper.command.getHeadOfLane(`${helper.scopes.remote}/lane-a`, `comp1`, bareMerge.scopePath)).to.equal(
        comp1HeadOnLaneB
      );
      expect(helper.command.getHeadOfLane(`${helper.scopes.remote}/lane-a`, `comp2`, bareMerge.scopePath)).to.equal(
        comp2HeadOnLaneB
      );
    });
    it('should not squash by default', () => {
      const head = helper.command.getHeadOfLane(`${helper.scopes.remote}/lane-a`, `comp2`, bareMerge.scopePath);
      const cat = helper.command.catComponent(`${helper.scopes.remote}/comp2@${head}`, bareMerge.scopePath);
      expect(cat.parents).to.have.lengthOf(1);
      const parent = cat.parents[0];
      expect(parent).to.equal(comp2PreviousHeadOnLaneB);
      expect(parent).to.not.equal(comp2HeadOnLaneA);
    });
    describe('running with --push flag', () => {
      before(() => {
        helper.scopeHelper.getClonedScope(beforeMerging, bareMerge.scopePath);
        helper.command.mergeLaneFromScope(
          bareMerge.scopePath,
          `${helper.scopes.remote}/lane-b`,
          `${helper.scopes.remote}/lane-a --push`
        );
      });
      it('should export the modified lane to the remote', () => {
        const headOnBare = helper.command.getHeadOfLane(`${helper.scopes.remote}/lane-a`, `comp2`, bareMerge.scopePath);
        const headOnRemote = helper.command.getHeadOfLane(
          `${helper.scopes.remote}/lane-a`,
          `comp2`,
          helper.scopes.remotePath
        );
        expect(headOnBare).to.equal(headOnRemote);
      });
    });
  });
  describe('merge from scope with multiple scopes and --push flag', () => {
    let bareMerge;
    let scope2Name;
    let scope2Path;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagWithoutBuild('comp2');
      helper.command.export();
      helper.command.createLane();

      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      scope2Name = scopeName;
      scope2Path = scopePath;
      helper.scopeHelper.addRemoteScope(scope2Path);
      helper.command.setScope(scope2Name, 'comp1');

      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      bareMerge = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareMerge.scopePath);
      helper.scopeHelper.addRemoteScope(scope2Path, bareMerge.scopePath);
      helper.command.mergeLaneFromScope(bareMerge.scopePath, `${helper.scopes.remote}/dev`, '--push');
    });
    it('should export the modified components to the remote', () => {
      const comp1OnBare = helper.command.catComponent(`${scope2Name}/comp1`, bareMerge.scopePath);
      const comp1OnRemote = helper.command.catComponent(`${scope2Name}/comp1`, scope2Path);
      expect(comp1OnBare.head).to.equal(comp1OnRemote.head);

      const comp2OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp2`, bareMerge.scopePath);
      const comp2OnRemote = helper.command.catComponent(`${helper.scopes.remote}/comp2`, helper.scopes.remotePath);
      expect(comp2OnBare.head).to.equal(comp2OnRemote.head);
    });
    it('bit import from the second scope should not throw', () => {
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.scopeHelper.addRemoteScope(scope2Path);
      expect(() => helper.command.import(`${scope2Name}/comp1`)).to.not.throw();
    });
  });
  describe('merge from scope lane to main when it is not up to date', () => {
    let bareMerge;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagWithoutBuild('comp2');
      helper.command.export();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.switchLocalLane('main');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      bareMerge = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareMerge.scopePath);
    });
    it('should throw', () => {
      const mergeFunc = () => helper.command.mergeLaneFromScope(bareMerge.scopePath, `${helper.scopes.remote}/dev`);
      expect(mergeFunc).to.throw('unable to merge, the following components are not up-to-date');
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
});
