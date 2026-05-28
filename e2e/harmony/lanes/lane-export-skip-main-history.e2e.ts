import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';

chai.use(chaiFs);

describe('lane export skips main history objects', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('lane in scope-L with components in scope-C, main advances, merge main into lane', () => {
    let laneScope: string;
    let laneScopePath: string;
    let mainSnap1: string;
    let mainSnap2: string;
    let mainSnap3: string;
    let mainSnap4: string;
    let laneSnap: string;
    let mergeSnap: string;

    before(() => {
      // scope-C: components' home scope (default remote)
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      // scope-L: the lane's home scope (separate)
      const newScope = helper.scopeHelper.getNewBareScope();
      laneScope = newScope.scopeName;
      laneScopePath = newScope.scopePath;
      helper.scopeHelper.addRemoteScope(laneScopePath);
      helper.scopeHelper.addRemoteScope(laneScopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, laneScopePath);

      // build several main snaps in scope-C
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      mainSnap1 = helper.command.getHead('comp1');
      helper.command.tagAllWithoutBuild('--unmodified');
      mainSnap2 = helper.command.getHead('comp1');
      helper.command.tagAllWithoutBuild('--unmodified');
      mainSnap3 = helper.command.getHead('comp1');
      helper.command.export();

      // create the lane in scope-L (off main, so its base is mainSnap3)
      helper.command.createLane('dev', `--scope ${laneScope}`);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      laneSnap = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.export();
      const laneWorkspace = helper.scopeHelper.cloneWorkspace();

      // main advances further (more snaps that the lane never saw)
      helper.command.switchLocalLane('main');
      helper.command.tagAllWithoutBuild('--unmodified');
      mainSnap4 = helper.command.getHead('comp1');
      helper.command.export();

      // back to lane, pick up new main, merge main in (no squash; that's the default for lane->merge)
      helper.scopeHelper.getClonedWorkspace(laneWorkspace);
      helper.command.import();
      helper.command.mergeLane('main', '--auto-merge-resolve theirs');
      mergeSnap = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.export();
    });

    describe('what was pushed to lane scope (scope-L)', () => {
      it('should contain the merge snap', () => {
        expect(() => helper.command.catObject(mergeSnap, false, laneScopePath)).to.not.throw();
      });

      it('should contain the lane-only snap', () => {
        expect(() => helper.command.catObject(laneSnap, false, laneScopePath)).to.not.throw();
      });

      it('should NOT contain main snaps that the lane was based on', () => {
        expect(() => helper.command.catObject(mainSnap1, false, laneScopePath)).to.throw();
        expect(() => helper.command.catObject(mainSnap2, false, laneScopePath)).to.throw();
        expect(() => helper.command.catObject(mainSnap3, false, laneScopePath)).to.throw();
      });

      it('should NOT contain the new main snap that got merged in', () => {
        expect(() => helper.command.catObject(mainSnap4, false, laneScopePath)).to.throw();
      });
    });

    describe('what stayed on component home scope (scope-C)', () => {
      it('should still contain all main snaps', () => {
        expect(() => helper.command.catObject(mainSnap1, false, helper.scopes.remotePath)).to.not.throw();
        expect(() => helper.command.catObject(mainSnap2, false, helper.scopes.remotePath)).to.not.throw();
        expect(() => helper.command.catObject(mainSnap3, false, helper.scopes.remotePath)).to.not.throw();
        expect(() => helper.command.catObject(mainSnap4, false, helper.scopes.remotePath)).to.not.throw();
      });
    });

    describe('fresh consumer imports the lane', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.scopeHelper.addRemoteScope(laneScopePath);
        helper.command.runCmd(`bit lane import ${laneScope}/dev -x`);
      });

      it('bit status should not throw', () => {
        expect(() => helper.command.status()).to.not.throw();
      });

      it('checkout HEAD should not throw', () => {
        expect(() => helper.command.checkoutHead()).to.not.throw();
      });

      it('bit log should not throw and should show the full history including main snaps', () => {
        // bit log walks parents into main history. lane scope does not have those snaps,
        // so the read path must fetch them from each component's home scope (scope-C)
        // transparently. importMissingHistory is server-side; this fallback is client-side.
        let log;
        expect(() => {
          log = helper.command.logParsed('comp1');
        }).to.not.throw();
        const hashes = log.map((l: any) => l.hash);
        expect(hashes).to.include(mergeSnap);
        expect(hashes).to.include(laneSnap);
        expect(hashes).to.include(mainSnap4);
        // pre-lane main history should also be reachable
        expect(hashes).to.include(mainSnap3);
        expect(hashes).to.include(mainSnap2);
        expect(hashes).to.include(mainSnap1);
      });

      it('VersionHistory on the component home scope should contain the full main chain', () => {
        const vh = helper.command.catVersionHistory(`${helper.scopes.remote}/comp1`, helper.scopes.remotePath);
        const hashes = (vh.versions as Array<{ hash: string }>).map((v) => v.hash);
        expect(hashes).to.include(mainSnap1);
        expect(hashes).to.include(mainSnap2);
        expect(hashes).to.include(mainSnap3);
        expect(hashes).to.include(mainSnap4);
      });

      it('VersionHistory on the lane scope should NOT include pre-lane main snaps (lean)', () => {
        const vh = helper.command.catVersionHistory(`${helper.scopes.remote}/comp1`, laneScopePath);
        const hashes = (vh.versions as Array<{ hash: string }>).map((v) => v.hash);
        expect(hashes).to.include(mergeSnap);
        expect(hashes).to.include(laneSnap);
        expect(hashes).to.not.include(mainSnap1);
        expect(hashes).to.not.include(mainSnap2);
        expect(hashes).to.not.include(mainSnap3);
      });
    });
  });

  describe('fork a lean lane to a third scope, then re-import in a fresh workspace', () => {
    let scopeC: string;
    let scopeCPath: string;
    let scopeL: string;
    let scopeLPath: string;
    let scopeF: string;
    let scopeFPath: string;
    let laneSnapOnL: string;
    let mergeSnapOnL: string;
    let snapOnFork: string;

    before(() => {
      // scope-C: components' home scope (default remote)
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      scopeC = helper.scopes.remote;
      scopeCPath = helper.scopes.remotePath;
      // scope-L: original lane scope
      const scopeLNew = helper.scopeHelper.getNewBareScope('-lane');
      scopeL = scopeLNew.scopeName;
      scopeLPath = scopeLNew.scopePath;
      // scope-F: the forked lane's destination scope
      const scopeFNew = helper.scopeHelper.getNewBareScope('-fork');
      scopeF = scopeFNew.scopeName;
      scopeFPath = scopeFNew.scopePath;
      // wire the scopes to know each other so cross-scope fetches resolve
      [scopeLPath, scopeFPath].forEach((p) => {
        helper.scopeHelper.addRemoteScope(p);
        helper.scopeHelper.addRemoteScope(p, scopeCPath);
        helper.scopeHelper.addRemoteScope(scopeCPath, p);
      });
      helper.scopeHelper.addRemoteScope(scopeLPath, scopeFPath);
      helper.scopeHelper.addRemoteScope(scopeFPath, scopeLPath);

      // build main history on scope-C
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();

      // create the original lane on scope-L
      helper.command.createLane('original', `--scope ${scopeL}`);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      laneSnapOnL = helper.command.getHeadOfLane('original', 'comp1');
      helper.command.export();

      // main advances on scope-C and gets merged into the lane
      const laneWs = helper.scopeHelper.cloneWorkspace();
      helper.command.switchLocalLane('main');
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();
      helper.scopeHelper.getClonedWorkspace(laneWs);
      helper.command.import();
      helper.command.mergeLane('main', '--auto-merge-resolve theirs');
      mergeSnapOnL = helper.command.getHeadOfLane('original', 'comp1');
      helper.command.export();
    });

    describe('fork the lane to scope-F and snap further', () => {
      before(() => {
        // fork "original" (in scope-L) into "forked" (in scope-F)
        helper.command.createLane('forked', `--scope ${scopeF} --fork-lane-new-scope`);
        helper.command.snapAllComponentsWithoutBuild('--unmodified');
        snapOnFork = helper.command.getHeadOfLane('forked', 'comp1');
        helper.command.export('--fork-lane-new-scope');
      });

      it('scope-F should NOT have the main-origin snaps (still lean after fork)', () => {
        // confirm fork didn't pull main history along
        const vh = helper.command.catVersionHistory(`${scopeC}/comp1`, scopeFPath);
        const hashes = (vh.versions as Array<{ hash: string }>).map((v) => v.hash);
        expect(hashes).to.include(snapOnFork);
        expect(hashes).to.include(mergeSnapOnL);
      });

      it('a fresh consumer can import the forked lane without errors', () => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.scopeHelper.addRemoteScope(scopeLPath);
        helper.scopeHelper.addRemoteScope(scopeFPath);
        expect(() => helper.command.runCmd(`bit lane import ${scopeF}/forked -x`)).to.not.throw();
      });

      it('bit status and bit log should work in the fresh consumer of the forked lane', () => {
        expect(() => helper.command.status()).to.not.throw();
        let log;
        expect(() => {
          log = helper.command.logParsed('comp1');
        }).to.not.throw();
        const hashes = log.map((l: any) => l.hash);
        expect(hashes).to.include(snapOnFork);
        expect(hashes).to.include(mergeSnapOnL);
        expect(hashes).to.include(laneSnapOnL);
      });
    });
  });

  describe('lane with multiple components and deep main history merged repeatedly', () => {
    // exercises the OOM-prone scenario at smaller scale: many main snaps, multiple merges of main into lane.
    let laneScope: string;
    let laneScopePath: string;
    let firstMergeSnap: string;
    let secondMergeSnap: string;
    let mainHeadBeforeFirstMerge: string;
    let mainHeadBeforeSecondMerge: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const newScope = helper.scopeHelper.getNewBareScope();
      laneScope = newScope.scopeName;
      laneScopePath = newScope.scopePath;
      helper.scopeHelper.addRemoteScope(laneScopePath);
      helper.scopeHelper.addRemoteScope(laneScopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, laneScopePath);

      // 3 components, deep main chain
      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
      for (let i = 0; i < 4; i += 1) helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();

      // lane is created off this point
      helper.command.createLane('dev', `--scope ${laneScope}`);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      const laneWs = helper.scopeHelper.cloneWorkspace();

      // main advances and lane merges main in (first merge)
      helper.command.switchLocalLane('main');
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.tagAllWithoutBuild('--unmodified');
      mainHeadBeforeFirstMerge = helper.command.getHead('comp1');
      helper.command.export();
      helper.scopeHelper.getClonedWorkspace(laneWs);
      helper.command.import();
      helper.command.mergeLane('main', '--auto-merge-resolve theirs');
      firstMergeSnap = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.export();

      // main advances again, second merge into the lane
      const laneWs2 = helper.scopeHelper.cloneWorkspace();
      helper.command.switchLocalLane('main');
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.tagAllWithoutBuild('--unmodified');
      mainHeadBeforeSecondMerge = helper.command.getHead('comp1');
      helper.command.export();
      helper.scopeHelper.getClonedWorkspace(laneWs2);
      helper.command.import();
      helper.command.mergeLane('main', '--auto-merge-resolve theirs');
      secondMergeSnap = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.export();
    });

    it('lane scope holds both merge snaps but no main-origin snaps for any component', () => {
      expect(() => helper.command.catObject(firstMergeSnap, false, laneScopePath)).to.not.throw();
      expect(() => helper.command.catObject(secondMergeSnap, false, laneScopePath)).to.not.throw();
      expect(() => helper.command.catObject(mainHeadBeforeFirstMerge, false, laneScopePath)).to.throw();
      expect(() => helper.command.catObject(mainHeadBeforeSecondMerge, false, laneScopePath)).to.throw();
    });

    it('the component home scope retains all main snaps for all components', () => {
      ['comp1', 'comp2', 'comp3'].forEach((c) => {
        const vh = helper.command.catVersionHistory(`${helper.scopes.remote}/${c}`, helper.scopes.remotePath);
        const hashes = (vh.versions as Array<{ hash: string }>).map((v) => v.hash);
        // 1 initial + 4 unmodified + 2 (first round) + 2 (second round) = 9 main snaps
        expect(hashes.length).to.be.at.least(9);
      });
    });

    describe('fresh consumer imports the multi-merge lane', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.scopeHelper.addRemoteScope(laneScopePath);
        helper.command.runCmd(`bit lane import ${laneScope}/dev -x`);
      });

      it('bit status should not throw for any component', () => {
        expect(() => helper.command.status()).to.not.throw();
      });

      it('bit log should reach both merge snaps and their main history for every component', () => {
        ['comp1', 'comp2', 'comp3'].forEach((c) => {
          const log = helper.command.logParsed(c);
          // 1 initial + 4 unmodified main + 1 lane + 2 main + 1 merge + 2 main + 1 merge = 12 snaps reachable
          expect(log.length).to.be.at.least(8);
        });
      });

      it('comp1 log should contain both merge snaps explicitly (sanity for the lane head)', () => {
        const log = helper.command.logParsed('comp1');
        const hashes = log.map((l: any) => l.hash);
        expect(hashes).to.include(firstMergeSnap);
        expect(hashes).to.include(secondMergeSnap);
      });
    });
  });

  describe('sanity: regular (non-merge) lane export still includes lane-only history fully', () => {
    let laneScope: string;
    let laneScopePath: string;
    let snap1: string;
    let snap2: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const newScope = helper.scopeHelper.getNewBareScope();
      laneScope = newScope.scopeName;
      laneScopePath = newScope.scopePath;
      helper.scopeHelper.addRemoteScope(laneScopePath);
      helper.scopeHelper.addRemoteScope(laneScopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, laneScopePath);

      // create a lane right away (no main tags), so all snaps are lane-origin
      helper.command.createLane('dev', `--scope ${laneScope}`);
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
      snap1 = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      snap2 = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.export();
    });

    it('lane scope should contain all lane-origin snaps', () => {
      expect(() => helper.command.catObject(snap1, false, laneScopePath)).to.not.throw();
      expect(() => helper.command.catObject(snap2, false, laneScopePath)).to.not.throw();
    });
  });

  describe('sanity: existing main-merge with no scope split still works (lane and components share scope)', () => {
    let mainSnap: string;
    let mergeSnap: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      mainSnap = helper.command.getHead('comp1');
      helper.command.export();

      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      const laneWorkspace = helper.scopeHelper.cloneWorkspace();

      helper.command.switchLocalLane('main');
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();

      helper.scopeHelper.getClonedWorkspace(laneWorkspace);
      helper.command.import();
      helper.command.mergeLane('main', '--auto-merge-resolve theirs');
      mergeSnap = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.export();
    });

    it('the shared remote scope should contain both the merge snap and the old main snap (same-scope case)', () => {
      // When lane scope == component scope, filtering by origin doesn't apply: everything already
      // belongs to this scope. Both objects should be present.
      expect(() => helper.command.catObject(mergeSnap, false, helper.scopes.remotePath)).to.not.throw();
      expect(() => helper.command.catObject(mainSnap, false, helper.scopes.remotePath)).to.not.throw();
    });

    it('bit log should work without errors', () => {
      expect(() => helper.command.logParsed('comp1')).to.not.throw();
    });
  });
});
