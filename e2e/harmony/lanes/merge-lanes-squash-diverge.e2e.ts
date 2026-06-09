import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';

chai.use(chaiFs);

describe('merge lanes - squash on diverged', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('single scope: two diverged lanes, --squash on merge', () => {
    let commonAncestor: string;
    let headOnLaneA: string;
    let headOnLaneB: string;
    let mergeSnap: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      commonAncestor = helper.command.getHead('comp1');
      helper.command.export();

      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // A1
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // A2
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // A3
      headOnLaneA = helper.command.getHeadOfLane('lane-a', 'comp1');
      helper.command.export();
      const laneAWorkspace = helper.scopeHelper.cloneWorkspace();

      helper.command.switchLocalLane('main');
      helper.command.createLane('lane-b');
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // B1
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // B2
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // B3
      headOnLaneB = helper.command.getHeadOfLane('lane-b', 'comp1');
      helper.command.export();

      helper.scopeHelper.getClonedWorkspace(laneAWorkspace);
      helper.command.import();
      helper.command.mergeLane('lane-b', '--squash --auto-merge-resolve theirs');
      mergeSnap = helper.command.getHeadOfLane('lane-a', 'comp1');
    });

    it('merge snap should have a single parent pointing to lane-a head', () => {
      const snap = helper.command.catComponent(`comp1@${mergeSnap}`);
      expect(snap.parents).to.have.lengthOf(1);
      expect(snap.parents[0]).to.equal(headOnLaneA);
    });

    it('merge snap should record squash metadata with the dropped lane-b head', () => {
      const snap = helper.command.catComponent(`comp1@${mergeSnap}`);
      expect(snap).to.have.property('squashed');
      const prevParents: string[] = snap.squashed.previousParents || snap.squashed.previousParentsRefs || [];
      expect(prevParents).to.include(headOnLaneB);
    });

    it('bit log should show a clean history without lane-b intermediate snaps', () => {
      const log = helper.command.logParsed('comp1');
      const hashes = log.map((l: any) => l.hash);
      expect(hashes).to.include(commonAncestor);
      expect(hashes).to.include(headOnLaneA);
      expect(hashes).to.include(mergeSnap);
      // lane-b intermediates should not be reachable from lane-a's head chain
      expect(hashes).to.not.include(headOnLaneB);
    });

    it('bit log should not throw', () => {
      expect(() => helper.command.logParsed('comp1')).to.not.throw();
    });
  });

  describe('multi scope: lane-a on scope-a, lane-b on scope-b, diverged, --squash', () => {
    let scopeB: string;
    let scopeBPath: string;
    let headOnLaneA: string;
    let headOnLaneB: string;
    let mergeSnap: string;
    let scopeAAfterExport: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const newScope = helper.scopeHelper.getNewBareScope();
      scopeB = newScope.scopeName;
      scopeBPath = newScope.scopePath;
      helper.scopeHelper.addRemoteScope(scopeBPath);
      helper.scopeHelper.addRemoteScope(scopeBPath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopeBPath);

      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // A1
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // A2
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // A3
      headOnLaneA = helper.command.getHeadOfLane('lane-a', 'comp1');
      helper.command.export();
      const laneAWorkspace = helper.scopeHelper.cloneWorkspace();

      helper.command.switchLocalLane('main');
      helper.command.createLane('lane-b', `--scope ${scopeB} --fork-lane-new-scope`);
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // B1
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // B2
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // B3
      headOnLaneB = helper.command.getHeadOfLane('lane-b', 'comp1');
      helper.command.export('--fork-lane-new-scope');

      helper.scopeHelper.getClonedWorkspace(laneAWorkspace);
      helper.command.import();
      helper.command.mergeLane(`${scopeB}/lane-b`, '--squash --auto-merge-resolve theirs');
      mergeSnap = helper.command.getHeadOfLane('lane-a', 'comp1');
      helper.command.export();
      scopeAAfterExport = helper.scopeHelper.cloneWorkspace();
    });

    it('merge snap should have a single parent pointing to lane-a head', () => {
      const snap = helper.command.catComponent(`comp1@${mergeSnap}`);
      expect(snap.parents).to.have.lengthOf(1);
      expect(snap.parents[0]).to.equal(headOnLaneA);
    });

    it('merge snap squash metadata should record the dropped lane-b head', () => {
      const snap = helper.command.catComponent(`comp1@${mergeSnap}`);
      expect(snap).to.have.property('squashed');
      const prevParents: string[] = snap.squashed.previousParents || snap.squashed.previousParentsRefs || [];
      expect(prevParents).to.include(headOnLaneB);
    });

    it('scope-a should NOT contain lane-b intermediate snaps after export', () => {
      // Inspect scope-a's storage: lane-b's snaps should remain on scope-b only.
      // catObject against the remote scope path; absence is signalled by throw.
      expect(() => helper.command.catObject(headOnLaneB, false, helper.scopes.remotePath)).to.throw();
    });

    it('scope-a should contain the merge snap', () => {
      expect(() => helper.command.catObject(mergeSnap, false, helper.scopes.remotePath)).to.not.throw();
    });

    it('scope-b should still contain lane-b intermediate snaps', () => {
      expect(() => helper.command.catObject(headOnLaneB, false, scopeBPath)).to.not.throw();
    });

    describe('fresh consumer imports lane-a from scope-a', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.scopeHelper.addRemoteScope(scopeBPath);
        helper.command.importLane('lane-a', '-x');
      });

      it('bit log should not throw on the merged component', () => {
        expect(() => helper.command.logParsed('comp1')).to.not.throw();
      });

      it('bit log should show the merge snap and lane-a chain, not lane-b intermediates', () => {
        const log = helper.command.logParsed('comp1');
        const hashes = log.map((l: any) => l.hash);
        expect(hashes).to.include(mergeSnap);
        expect(hashes).to.include(headOnLaneA);
        expect(hashes).to.not.include(headOnLaneB);
      });

      it('bit status should not throw', () => {
        expect(() => helper.command.status()).to.not.throw();
      });
    });

    describe('re-merge of lane-b after it advances with new snaps', () => {
      let headOnLaneBAfter: string;
      let secondMergeSnap: string;
      before(() => {
        // advance lane-b on a separate workspace tied to scope-b
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.scopeHelper.addRemoteScope(scopeBPath);
        helper.command.runCmd(`bit lane import ${scopeB}/lane-b -x`);
        helper.command.snapAllComponentsWithoutBuild('--unmodified'); // B4
        helper.command.snapAllComponentsWithoutBuild('--unmodified'); // B5
        headOnLaneBAfter = helper.command.getHeadOfLane(`${scopeB}/lane-b`, 'comp1');
        helper.command.export();

        // return to the lane-a workspace and re-merge lane-b
        helper.scopeHelper.getClonedWorkspace(scopeAAfterExport);
        helper.command.import();
        helper.command.mergeLane(`${scopeB}/lane-b`, '--squash --auto-merge-resolve theirs');
        secondMergeSnap = helper.command.getHeadOfLane('lane-a', 'comp1');
      });

      it('second merge snap should have a single parent pointing to the previous merge snap', () => {
        const snap = helper.command.catComponent(`comp1@${secondMergeSnap}`);
        expect(snap.parents).to.have.lengthOf(1);
        expect(snap.parents[0]).to.equal(mergeSnap);
      });

      it('second merge snap should record the new dropped lane-b head (B5), not B3', () => {
        const snap = helper.command.catComponent(`comp1@${secondMergeSnap}`);
        expect(snap).to.have.property('squashed');
        const prevParents: string[] = snap.squashed.previousParents || snap.squashed.previousParentsRefs || [];
        expect(prevParents).to.include(headOnLaneBAfter);
        // crucially, should not re-include B3 (already merged previously)
        expect(prevParents).to.not.include(headOnLaneB);
      });

      it('bit log after re-merge should not throw', () => {
        expect(() => helper.command.logParsed('comp1')).to.not.throw();
      });

      it('bit log after re-merge should show two merge snaps in the chain, no lane-b intermediates', () => {
        const log = helper.command.logParsed('comp1');
        const hashes = log.map((l: any) => l.hash);
        expect(hashes).to.include(mergeSnap);
        expect(hashes).to.include(secondMergeSnap);
        expect(hashes).to.not.include(headOnLaneB);
        expect(hashes).to.not.include(headOnLaneBAfter);
      });

      it('re-merge should export to scope-a without errors', () => {
        expect(() => helper.command.export()).to.not.throw();
      });
    });
  });

  describe('sanity: diverged merge without --squash still produces a two-parent merge snap', () => {
    let headOnLaneA: string;
    let headOnLaneB: string;
    let mergeSnap: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      headOnLaneA = helper.command.getHeadOfLane('lane-a', 'comp1');
      helper.command.export();
      const laneAWorkspace = helper.scopeHelper.cloneWorkspace();

      helper.command.switchLocalLane('main');
      helper.command.createLane('lane-b');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      headOnLaneB = helper.command.getHeadOfLane('lane-b', 'comp1');
      helper.command.export();

      helper.scopeHelper.getClonedWorkspace(laneAWorkspace);
      helper.command.import();
      helper.command.mergeLane('lane-b', '--auto-merge-resolve theirs');
      mergeSnap = helper.command.getHeadOfLane('lane-a', 'comp1');
    });

    it('merge snap should have two parents (lane-a head and lane-b head)', () => {
      const snap = helper.command.catComponent(`comp1@${mergeSnap}`);
      expect(snap.parents).to.have.lengthOf(2);
      expect(snap.parents).to.include(headOnLaneA);
      expect(snap.parents).to.include(headOnLaneB);
    });

    it('merge snap should NOT have squash metadata', () => {
      const snap = helper.command.catComponent(`comp1@${mergeSnap}`);
      expect(snap).to.not.have.property('squashed');
    });
  });

  describe('lane into main, diverged, --squash', () => {
    let commonAncestor: string;
    let headOnMain: string;
    let headOnLane: string;
    let mergeSnap: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      commonAncestor = helper.command.getHead('comp1');
      helper.command.export();

      // advance the lane independently of main
      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // L1
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // L2
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // L3
      headOnLane = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.export();

      // advance main independently — now main and dev are diverged from commonAncestor
      helper.command.switchLocalLane('main');
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // M1
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // M2
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // M3
      headOnMain = helper.command.getHead('comp1');
      helper.command.export();

      // merge dev into main with --squash on a diverged history (pre-PR this threw)
      helper.command.mergeLane('dev', '--squash --auto-merge-resolve theirs');
      mergeSnap = helper.command.getHead('comp1');
    });

    it('merge snap on main should have a single parent pointing to the previous main head', () => {
      const snap = helper.command.catComponent(`comp1@${mergeSnap}`);
      expect(snap.parents).to.have.lengthOf(1);
      expect(snap.parents[0]).to.equal(headOnMain);
    });

    it('merge snap should record squash metadata with the dropped lane head', () => {
      const snap = helper.command.catComponent(`comp1@${mergeSnap}`);
      expect(snap).to.have.property('squashed');
      const prevParents: string[] = snap.squashed.previousParents || snap.squashed.previousParentsRefs || [];
      expect(prevParents).to.include(headOnLane);
    });

    it('bit log on main should not throw', () => {
      expect(() => helper.command.logParsed('comp1')).to.not.throw();
    });

    it('bit log on main should show the main chain + merge snap, not the lane intermediates', () => {
      const log = helper.command.logParsed('comp1');
      const hashes = log.map((l: any) => l.hash);
      expect(hashes).to.include(commonAncestor);
      expect(hashes).to.include(headOnMain);
      expect(hashes).to.include(mergeSnap);
      // lane snaps must not be reachable from main head's parent chain
      expect(hashes).to.not.include(headOnLane);
    });

    it('exporting main after the merge should succeed', () => {
      expect(() => helper.command.export()).to.not.throw();
    });
  });

  describe('lane into main, cross-scope, diverged, --squash with fresh consumer', () => {
    let scopeB: string;
    let scopeBPath: string;
    let commonAncestor: string;
    let headOnMain: string;
    let intermediateLaneSnap1: string;
    let intermediateLaneSnap2: string;
    let headOnLane: string;
    let mergeSnap: string;
    let compFullId: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const newScope = helper.scopeHelper.getNewBareScope();
      scopeB = newScope.scopeName;
      scopeBPath = newScope.scopePath;
      helper.scopeHelper.addRemoteScope(scopeBPath);
      helper.scopeHelper.addRemoteScope(scopeBPath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopeBPath);

      compFullId = `${helper.scopes.remote}/comp1`;
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      commonAncestor = helper.command.getHead('comp1');
      helper.command.export(); // main → scope-a (default remote)

      // dev lane lives on scope-b; advance it by 3 snaps (Case B: lane progresses by multiple)
      helper.command.createLane('dev', `--scope ${scopeB} --fork-lane-new-scope`);
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // L1
      intermediateLaneSnap1 = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // L2
      intermediateLaneSnap2 = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // L3
      headOnLane = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.export('--fork-lane-new-scope');

      // advance main on scope-a — now main and dev are diverged from commonAncestor
      helper.command.switchLocalLane('main');
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // M1
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // M2
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // M3
      headOnMain = helper.command.getHead('comp1');
      helper.command.export();

      // diverged squash from main side: dev lives on scope-b, main on scope-a
      helper.command.mergeLane(`${scopeB}/dev`, '--squash --auto-merge-resolve theirs');
      mergeSnap = helper.command.getHead('comp1');
      helper.command.export(); // merge snap → scope-a (main's home)
    });

    it('merge snap on main should have a single parent pointing to the previous main head', () => {
      const snap = helper.command.catComponent(`comp1@${mergeSnap}`);
      expect(snap.parents).to.have.lengthOf(1);
      expect(snap.parents[0]).to.equal(headOnMain);
    });

    it('merge snap should record squash metadata pointing at the dropped lane head (L3)', () => {
      const snap = helper.command.catComponent(`comp1@${mergeSnap}`);
      expect(snap).to.have.property('squashed');
      const prevParents: string[] = snap.squashed.previousParents || snap.squashed.previousParentsRefs || [];
      expect(prevParents).to.include(headOnLane);
    });

    describe('fresh consumer imports comp1 from scope-a (no scope-b in remotes)', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        // intentionally only add scope-a — verify the consumer doesn't need scope-b
        // to read comp1's history (i.e. lane intermediates were not shipped to scope-a)
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('comp1');
      });

      it('bit status should not throw', () => {
        expect(() => helper.command.status()).to.not.throw();
      });

      it('bit log should not throw', () => {
        expect(() => helper.command.logParsed(compFullId)).to.not.throw();
      });

      it('bit log should show common ancestor + main chain + merge snap', () => {
        const log = helper.command.logParsed(compFullId);
        const hashes = log.map((l: any) => l.hash);
        expect(hashes).to.include(commonAncestor);
        expect(hashes).to.include(headOnMain);
        expect(hashes).to.include(mergeSnap);
      });

      it('bit log should NOT include the dev lane intermediates (they live only on scope-b)', () => {
        const log = helper.command.logParsed(compFullId);
        const hashes = log.map((l: any) => l.hash);
        expect(hashes).to.not.include(intermediateLaneSnap1);
        expect(hashes).to.not.include(intermediateLaneSnap2);
        expect(hashes).to.not.include(headOnLane);
      });
    });
  });

  describe('sanity: squash on non-diverged (fast-forward) lane-to-lane merge', () => {
    let commonHead: string;
    let mergeSnap: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      commonHead = helper.command.getHead('comp1');
      helper.command.export();

      helper.command.createLane('lane-a');
      // lane-a does NOT advance — stays at the common head
      helper.command.export();

      helper.command.switchLocalLane('main');
      helper.command.createLane('lane-b');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();

      helper.command.switchLocalLane('lane-a');
      helper.command.mergeLane('lane-b', '--squash --auto-merge-resolve theirs');
      mergeSnap = helper.command.getHeadOfLane('lane-a', 'comp1');
    });

    it('squashed snap on lane-a should have a single parent pointing to the common head', () => {
      const snap = helper.command.catComponent(`comp1@${mergeSnap}`);
      expect(snap.parents).to.have.lengthOf(1);
      expect(snap.parents[0]).to.equal(commonHead);
    });

    it('bit log should not throw', () => {
      expect(() => helper.command.logParsed('comp1')).to.not.throw();
    });
  });
});
