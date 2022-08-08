import chai, { expect } from 'chai';
import path from 'path';
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
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.addRemoteScope();
        helper.command.fetchRemoteLane('dev');
        mergeOutput = helper.command.mergeRemoteLane(`dev`, undefined, `--workspace --verbose`);
      });
      it('should indicate that the components were not merge because they are not in the workspace', () => {
        expect(mergeOutput).to.have.string('the merge has been canceled on the following component(s)');
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
        helper.scopeHelper.reInitLocalScopeHarmony();
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
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
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
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
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
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
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
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
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
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      headOnMain = helper.command.getHead('comp1');
      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      headOnLane = helper.command.getHeadOfLane('dev', 'comp1');
      // as an intermediate step, verify that it has 4 snaps.
      const log = helper.command.logParsed('comp1');
      expect(log).to.have.lengthOf(4);

      helper.command.switchLocalLane('main');
      helper.command.mergeLane('dev', '--squash');
    });
    it('should squash the snaps and leave only the last one', () => {
      const log = helper.command.logParsed('comp1');
      expect(log).to.have.lengthOf(2);

      expect(log[0].hash).to.equal(headOnLane);
      expect(log[0].parents[0]).to.equal(headOnMain);
      expect(log[1].hash).to.equal(headOnMain);
    });
  });
  describe('partial merge', () => {
    describe('from a lane to main', () => {
      let comp1HeadOnLane: string;
      let comp2HeadOnLane: string;
      let comp3HeadOnLane: string;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
        helper.bitJsonc.setupDefault();
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
            'it has the following dependencies which were not included in the pattern. consider adding "--include-deps" flag'
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
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
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
      const status = helper.command.status();
      expect(status).to.have.string(`${helper.scopes.remote}/comp1 ... main is ahead by 1 snaps`);
    });
    describe('merging the lane', () => {
      let status;
      before(() => {
        helper.command.mergeLane('main', '--theirs');
        status = helper.command.statusJson();
      });
      it('bit status should show two staging versions, the main-head and merge-snap', () => {
        const stagedVersions = status.stagedComponents.find((c) => c.id === `${helper.scopes.remote}/comp2`);
        expect(stagedVersions.versions).to.have.lengthOf(2);
        expect(stagedVersions.versions).to.include(comp2HeadOnMain);
        expect(stagedVersions.versions).to.include(helper.command.getHeadOfLane('dev', 'comp2'));
      });
      it('bit status should not show the components in pending-merge', () => {
        expect(status.mergePendingComponents).to.have.lengthOf(0);
      });
      describe('switching to main and merging the lane to main', () => {
        before(() => {
          helper.command.switchLocalLane('main');
          helper.command.mergeLane('dev');
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
    });
  });
});
