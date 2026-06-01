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

      it('should NOT contain pre-lane main Version objects (the lean part stays lean)', () => {
        // mainSnap1, mainSnap2 are older main snaps. Nothing pulls them — the import-time VH
        // fetch grabs only the home-scope head Version (one Version per export, not the chain).
        expect(() => helper.command.catObject(mainSnap1, false, laneScopePath)).to.throw();
        expect(() => helper.command.catObject(mainSnap2, false, laneScopePath)).to.throw();
      });

      it('SHOULD contain the home-scope head Versions at each export point (one per export)', () => {
        // VH-completeness invariant: importMissingVersionHistory pulls VH + the latest head
        // Version from each component's home scope. That's ONE Version per component per
        // export — not the OOM chain.
        //   - mainSnap3 was the home-scope head at the first lane export (laneSnap).
        //   - mainSnap4 was the home-scope head at the second lane export (mergeSnap).
        expect(() => helper.command.catObject(mainSnap3, false, laneScopePath)).to.not.throw();
        expect(() => helper.command.catObject(mainSnap4, false, laneScopePath)).to.not.throw();
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

      it('VersionHistory on the lane scope is a closed graph (covers main + lane snaps)', () => {
        // Lean-lane-scope invariant: after every export the destination scope's VH is closed.
        // Version OBJECTS for older main snaps still stay on the home scope — the saving is in
        // Version bytes, not VH bytes (VH is metadata; ~50 bytes/entry).
        const vh = helper.command.catVersionHistory(`${helper.scopes.remote}/comp1`, laneScopePath);
        const hashes = (vh.versions as Array<{ hash: string }>).map((v) => v.hash);
        expect(hashes).to.include(mergeSnap);
        expect(hashes).to.include(laneSnap);
        expect(hashes).to.include(mainSnap1);
        expect(hashes).to.include(mainSnap2);
        expect(hashes).to.include(mainSnap3);
        expect(hashes).to.include(mainSnap4);
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
    let snapOnFork: string;
    let mainSnapPre1: string;
    let mainSnapPre2: string;
    let mainSnapPost: string;

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
      mainSnapPre1 = helper.command.getHead('comp1');
      helper.command.tagAllWithoutBuild('--unmodified');
      mainSnapPre2 = helper.command.getHead('comp1');
      helper.command.export();

      // create the original lane on scope-L
      helper.command.createLane('original', `--scope ${scopeL}`);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();

      // main advances on scope-C and gets merged into the lane
      const laneWs = helper.scopeHelper.cloneWorkspace();
      helper.command.switchLocalLane('main');
      helper.command.tagAllWithoutBuild('--unmodified');
      mainSnapPost = helper.command.getHead('comp1');
      helper.command.export();
      helper.scopeHelper.getClonedWorkspace(laneWs);
      helper.command.import();
      helper.command.mergeLane('main', '--auto-merge-resolve theirs');
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

      it('scope-F should hold the forked lane head (snapOnFork)', () => {
        // Lean-fork: the destination scope receives the lane heads. Deeper ancestry like
        // mergeSnapOnL stays on the original lane scope (scope-L) — consumers fetch on demand.
        expect(() => helper.command.catObject(snapOnFork, false, scopeFPath)).to.not.throw();
      });

      it('scope-F stays lean: no main-origin Version objects, but VH is a closed graph', () => {
        // Lean = no main-origin Version OBJECTS on the fork scope (the byte savings).
        expect(() => helper.command.catObject(mainSnapPre1, false, scopeFPath)).to.throw();
        expect(() => helper.command.catObject(mainSnapPre2, false, scopeFPath)).to.throw();
        expect(() => helper.command.catObject(mainSnapPost, false, scopeFPath)).to.throw();
        // VH metadata IS expected to be complete on scope-F (so divergence/merge-lane work on
        // consumers). importAndThrowForMissingHistoryOnLane fetches VH from the forked-from
        // lane's scope (scope-L) which by invariant already has the closed chain.
        const vh = helper.command.catVersionHistory(`${scopeC}/comp1`, scopeFPath);
        const hashes = (vh.versions as Array<{ hash: string }>).map((v) => v.hash);
        expect(hashes).to.include(mainSnapPre1);
        expect(hashes).to.include(mainSnapPre2);
        expect(hashes).to.include(mainSnapPost);
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
        // Lean fork: scope-F holds only the lane head. Deeper ancestry (mergeSnapOnL, laneSnapOnL)
        // lives on scope-L and the client-side `collectLogs` fallback only retries against the
        // component home scope, so it can't reach them here. Surfacing those would require the
        // consumer to also fetch from the original lane scope — separate from this PR's lean fix.
        expect(hashes).to.include(snapOnFork);
      });

      describe('traversal-dependent commands on a fresh consumer of the forked lane', () => {
        // The forked lane head (snapOnFork) has a parent (mergeSnapOnL) that is a *lane-origin*
        // snap on scope-L. scope-F doesn't have its Version object (lean fork). The consumer
        // imports from scope-F and inherits a VersionHistory that references mergeSnapOnL as a
        // parent without the underlying Version object — a dangling parent ref.
        //
        // The post-import healing (`importMissingHistory`) only retries the component's home
        // scope (scope-C) for missing parents. scope-C doesn't have mergeSnapOnL either, since
        // it's lane-origin. So the consumer's local VH stays truncated at snapOnFork.
        //
        // These tests exercise commands that walk the VH past the head — they should succeed
        // but today they break.
        before(() => {
          helper.scopeHelper.reInitWorkspace();
          helper.scopeHelper.addRemoteScope();
          helper.scopeHelper.addRemoteScope(scopeLPath);
          helper.scopeHelper.addRemoteScope(scopeFPath);
          helper.command.runCmd(`bit lane import ${scopeF}/forked -x`);
        });

        it('bit lane merge main should succeed (traversal finds the common ancestor)', () => {
          // Regression: before the export-time VH fetch was in place, the common ancestor
          // walk truncated at snapOnFork (parent mergeSnapOnL was missing locally) and the
          // merge failed with "no common snap" / "histories not related". With the fix, the
          // VH is closed and the merge finds the correct common ancestor.
          expect(() =>
            helper.command.mergeLaneWithoutBuild('main', '--auto-merge-resolve theirs --ignore-config-changes -x')
          ).to.not.throw();
        });

        it('consumer VersionHistory should be a closed graph (no dangling parent refs)', () => {
          // After `bit lane import`, the consumer's local VH for the foreign component must
          // include an entry for every parent reachable from the lane head. Today the VH is
          // truncated: it has `snapOnFork → [mergeSnapOnL]` but no entry for mergeSnapOnL.
          // The home-scope healing fetches main-origin VH from scope-C, but mergeSnapOnL is a
          // lane-origin snap living on scope-L — out of reach.
          const vh = helper.command.catVersionHistory(`${scopeC}/comp1`);
          const versions = vh.versions as Array<{ hash: string; parents: string[] }>;
          const hashes = new Set(versions.map((v) => v.hash));
          const dangling: string[] = [];
          for (const v of versions) {
            for (const p of v.parents) {
              if (!hashes.has(p)) dangling.push(`${v.hash.slice(0, 8)} -> ${p.slice(0, 8)}`);
            }
          }
          expect(dangling, `dangling parent refs in consumer VH:\n${dangling.join('\n')}`).to.have.lengthOf(0);
        });
      });
    });
  });

  // regression: importing a lean lane, then `bit lane create` + `bit lane change-scope` used to crash
  // `bit status` with `TargetHeadNotFound` because divergence fell back to the component's main-head
  // (not present on the lean lane scope). The fix in `calculateRemote` uses the forked-from lane's
  // head as the baseline for cross-scope forks instead.
  describe('fresh consumer of a lean lane: create new lane + change-scope', () => {
    let scopeL: string;
    let scopeLPath: string;
    let scopeF: string;
    let scopeFPath: string;

    before(() => {
      // scope-C (default remote) = component home scope; scope-L = lane scope (lean);
      // scope-F = the fork target scope (where the new forked lane gets pushed).
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const lNew = helper.scopeHelper.getNewBareScope('-lean-lane');
      scopeL = lNew.scopeName;
      scopeLPath = lNew.scopePath;
      const fNew = helper.scopeHelper.getNewBareScope('-fork-target');
      scopeF = fNew.scopeName;
      scopeFPath = fNew.scopePath;
      [scopeLPath, scopeFPath].forEach((p) => {
        helper.scopeHelper.addRemoteScope(p);
        helper.scopeHelper.addRemoteScope(p, helper.scopes.remotePath);
        helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, p);
      });
      helper.scopeHelper.addRemoteScope(scopeLPath, scopeFPath);
      helper.scopeHelper.addRemoteScope(scopeFPath, scopeLPath);

      // build main history on scope-C, then advance main further so the lane never sees the latest main-head.
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-a', `--scope ${scopeL}`);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.switchLocalLane('main', '-x');
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();

      // fresh consumer: import the lean lane, then create a forked lane and change its scope to scopeF.
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.scopeHelper.addRemoteScope(scopeLPath);
      helper.scopeHelper.addRemoteScope(scopeFPath);
      helper.command.runCmd(`bit lane import ${scopeL}/lane-a -x`);
      helper.command.createLane('forked-lane');
      helper.command.changeLaneScope(scopeF);
    });

    it('bit status should not throw', () => {
      expect(() => helper.command.status()).to.not.throw();
    });

    it('bit status should NOT report the entire history as staged — only true local snaps', () => {
      // The consumer hasn't snapped on the forked lane, so there should be nothing staged.
      // (Before the fix, calculateRemote returned null on cross-scope forks, making the full
      // history of every component show up as staged.)
      const status = helper.command.statusJson();
      expect(status.stagedComponents).to.have.lengthOf(0);
    });

    it('bit export --fork-lane-new-scope should succeed without --all and without VersionNotFoundOnFS', () => {
      // Regression: plain --fork-lane-new-scope used to bail "no changes — use --all", and --all
      // then crashed with VersionNotFoundOnFS on un-pulled main history.
      expect(() => helper.command.export('--fork-lane-new-scope')).to.not.throw();
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

    it('lane scope holds both merge snaps plus the home-scope head at each export point', () => {
      // Lean-lane-scope invariant: lane snaps + one main-origin Version per export (the
      // home-scope head at that export's moment). The deep main chain stays on scope-C.
      expect(() => helper.command.catObject(firstMergeSnap, false, laneScopePath)).to.not.throw();
      expect(() => helper.command.catObject(secondMergeSnap, false, laneScopePath)).to.not.throw();
      // these two were the home-scope heads at the first/second exports — pulled along with VH.
      expect(() => helper.command.catObject(mainHeadBeforeFirstMerge, false, laneScopePath)).to.not.throw();
      expect(() => helper.command.catObject(mainHeadBeforeSecondMerge, false, laneScopePath)).to.not.throw();
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

  // Edge case: chained local forks. lane-a exported to scope-A; lane-b forked locally from
  // lane-a (never exported); lane-c forked locally from lane-b (also local) and then exported.
  // Important: `getLaneOrigin` (scopes/lanes/modules/create-lane/create-lane.ts:88) walks the
  // local fork chain at lane-creation time and sets the new lane's forkedFrom to the nearest
  // EXPORTED ancestor — so lane-c.forkedFrom is lane-a, not lane-b. This keeps the server-side
  // forkedFrom fetch resolvable. The test exists to guard that invariant.
  describe('chained local forks: lane-a (exported) → lane-b (local) → lane-c (exported)', () => {
    let scopeA: string;
    let scopeAPath: string;
    let scopeC: string;
    let scopeCPath: string;
    let snapOnLaneC: string;

    before(() => {
      // home scope for components
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      // scope-A: where lane-a lives.
      const aNew = helper.scopeHelper.getNewBareScope('-lane-a');
      scopeA = aNew.scopeName;
      scopeAPath = aNew.scopePath;
      // scope-C: where lane-c will be exported.
      const cNew = helper.scopeHelper.getNewBareScope('-lane-c');
      scopeC = cNew.scopeName;
      scopeCPath = cNew.scopePath;
      [scopeAPath, scopeCPath].forEach((p) => {
        helper.scopeHelper.addRemoteScope(p);
        helper.scopeHelper.addRemoteScope(p, helper.scopes.remotePath);
        helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, p);
      });
      helper.scopeHelper.addRemoteScope(scopeAPath, scopeCPath);
      helper.scopeHelper.addRemoteScope(scopeCPath, scopeAPath);

      // main snap on home scope
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      // lane-a on scope-A — exported
      helper.command.createLane('lane-a', `--scope ${scopeA}`);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();

      // lane-b: local fork of lane-a. NOT exported.
      helper.command.createLane('lane-b');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');

      // lane-c: local fork of lane-b, exported to scope-C with --fork-lane-new-scope.
      helper.command.createLane('lane-c', `--scope ${scopeC} --fork-lane-new-scope`);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      snapOnLaneC = helper.command.getHeadOfLane('lane-c', 'comp1');
    });

    it('exporting lane-c should succeed even though its forkedFrom (lane-b) never reached a remote', () => {
      // The server's importAndThrowForMissingHistoryOnLane sees lane-c.forkedFrom = lane-b.
      // It tries to fetch lane-b from lane-b's scope — but lane-b doesn't exist there. The
      // export needs to handle this gracefully (walk the chain or fall back), not crash.
      expect(() => helper.command.export('--fork-lane-new-scope')).to.not.throw();
    });

    it('scope-C should contain the lane-c head Version', () => {
      expect(() => helper.command.catObject(snapOnLaneC, false, scopeCPath)).to.not.throw();
    });

    it('scope-C VersionHistory should be a closed graph despite the local-fork chain', () => {
      const vh = helper.command.catVersionHistory(`${helper.scopes.remote}/comp1`, scopeCPath);
      const versions = vh.versions as Array<{ hash: string; parents: string[] }>;
      const hashes = new Set(versions.map((v) => v.hash));
      const dangling: string[] = [];
      for (const v of versions) {
        for (const p of v.parents) {
          if (!hashes.has(p)) dangling.push(`${v.hash.slice(0, 8)} -> ${p.slice(0, 8)}`);
        }
      }
      expect(dangling, `dangling parent refs in scope-C VH:\n${dangling.join('\n')}`).to.have.lengthOf(0);
    });
  });
});
