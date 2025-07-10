import chai, { expect } from 'chai';
import { uniq } from 'lodash';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('merge lanes - unrelated components', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('multiple scopes when a component in the origin is different than on the lane', () => {
    let originRemote: string;
    let originPath: string;
    let afterLaneExport: string;
    let mainHead: string;
    let laneScopeHead: string;
    let remoteScopeAfterExport: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
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
      afterLaneExport = helper.scopeHelper.cloneWorkspace();
      remoteScopeAfterExport = helper.scopeHelper.cloneRemoteScope();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.workspaceJsonc.addDefaultScope(originRemote);
      helper.fixtures.populateComponents(1, false, 'on-origin');
      helper.command.tagAllWithoutBuild();
      mainHead = helper.command.getHead('comp1');
      helper.command.export();

      helper.scopeHelper.getClonedWorkspace(afterLaneExport);
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
    describe('bit lane merge with --resolve-unrelated and --no-auto-snap', () => {
      before(() => {
        helper.scopeHelper.getClonedRemoteScope(remoteScopeAfterExport);
        helper.scopeHelper.getClonedWorkspace(afterLaneExport);
        helper.command.import();
        helper.command.mergeLane('main', '--resolve-unrelated --no-auto-snap');
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
        helper.scopeHelper.getClonedWorkspace(afterLaneExport);
        helper.command.import();
        helper.command.mergeLane('main', '--resolve-unrelated theirs --no-auto-snap');
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
        helper.scopeHelper.getClonedWorkspace(afterLaneExport);
        helper.command.createLane('dev2', `--remote-scope ${helper.scopes.remote}`);
        helper.command.snapAllComponentsWithoutBuild('--unmodified');
        helper.command.export();
        helper.command.switchLocalLane('dev');
        helper.command.import();
        helper.command.mergeLane('main', '--resolve-unrelated');
        laneHeadAfterMerge = helper.command.getHeadOfLane('dev', 'comp1');
        helper.command.export();
        beforeMergingSecondLane = helper.scopeHelper.cloneWorkspace();
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
          helper.scopeHelper.reInitWorkspace();
          helper.scopeHelper.addRemoteScope(originPath);
          helper.command.import(`${originRemote}/comp1`);
          helper.command.tagAllWithoutBuild('--unmodified');
          helper.command.export();

          helper.scopeHelper.getClonedWorkspace(beforeMergingSecondLane);
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
        helper.scopeHelper.getClonedWorkspace(afterLaneExport);
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
        helper.scopeHelper.getClonedWorkspace(afterLaneExport);
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
        helper.scopeHelper.getClonedWorkspace(afterLaneExport);
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
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

      helper.scopeHelper.reInitWorkspace();
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(1, false, 'lane-a');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      headOnLaneA = helper.command.getHeadOfLane('lane-a', 'comp1');

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.createLane('lane-b');
      helper.fixtures.populateComponents(1, false, 'lane-b');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      headOnLaneB = helper.command.getHeadOfLane('lane-b', 'comp1');
      beforeMerge = helper.scopeHelper.cloneWorkspace();
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
        helper.scopeHelper.getClonedWorkspace(beforeMerge);
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
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
});
