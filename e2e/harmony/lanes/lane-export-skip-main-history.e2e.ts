import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';

chai.use(chaiFs);

function danglingParentsIn(vh: Record<string, any>): string[] {
  const versions = vh.versions as Array<{ hash: string; parents: string[] }>;
  const hashes = new Set(versions.map((v) => v.hash));
  const dangling: string[] = [];
  for (const v of versions) {
    for (const p of v.parents) {
      if (!hashes.has(p)) dangling.push(`${v.hash.slice(0, 8)} -> ${p.slice(0, 8)}`);
    }
  }
  return dangling;
}

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

      it('bit lane diff <lean-lane> main should not throw on a fresh consumer', () => {
        // lane-diff resolves both heads and walks ancestry to summarize "what's different".
        // On a lean lane consumer, main-origin parents below the lane snap aren't on disk
        // locally. The walk should fall back to fetching from the home scope rather than
        // crash with ParentNotFound.
        expect(() => helper.command.diffLane(`${laneScope}/dev main`)).to.not.throw();
      });

      it('bit checkout HEAD~N to a main-only ancestor should not crash on a lean lane consumer', () => {
        // `getRefOfAncestor` walks VH (closed locally, so the walk succeeds) and returns the
        // hash N generations back. checkout then needs to LOAD that Version object from disk.
        // For a lean lane consumer, deep main ancestors are NOT on disk locally — the lane
        // scope never had them, and lane-import doesn't pull main history pre-emptively. We
        // expect bit checkout to either succeed (by fetching the missing Version on demand)
        // or fail with a helpful, non-crash error pointing at `bit import`.
        let stderr = '';
        try {
          helper.command.runCmd('bit checkout head~3 comp1');
        } catch (err: any) {
          stderr = String(err.stderr || err.message || '');
        }
        expect(stderr, `bit checkout head~3 output: ${stderr}`).to.not.match(
          /Version.*not.*loaded|TypeError|Cannot read/i
        );
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
        expect(() => helper.command.catObject(snapOnFork, false, scopeFPath)).to.not.throw();
      });

      it("scope-F's VersionHistory should be a closed graph", () => {
        // Closure must hold on the destination scope so divergence/merge-lane work on
        // consumers. importAndThrowForMissingHistoryOnLane fetches VH from the forked-from
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
        // Regression coverage. Before the export-time VH fetch from the forked-from lane's
        // scope (added in this PR), scope-F's VH for the foreign component referenced
        // mergeSnapOnL as a parent without an underlying entry — a dangling ref. The
        // post-import healing (`importMissingHistory`) only retried the component's home
        // scope (scope-C), which didn't have mergeSnapOnL either (lane-origin snap living on
        // scope-L), so the consumer's VH stayed truncated and traversal-dependent commands
        // broke. The export-validate fetch now closes the chain on scope-F, so these commands
        // succeed.
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
          // include an entry for every parent reachable from the lane head. (Before the fix
          // it was truncated at snapOnFork; mergeSnapOnL was a dangling ref because the
          // home-scope healing couldn't fetch it from scope-L.)
          const dangling = danglingParentsIn(helper.command.catVersionHistory(`${scopeC}/comp1`));
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

    it('exporting lane-c should succeed because forkedFrom is resolved to the nearest exported ancestor', () => {
      // `getLaneOrigin` (see the describe-level comment) sets lane-c.forkedFrom to lane-a (the
      // nearest exported ancestor) at lane-creation time, not lane-b. So the server-side
      // import-and-throw on the export reaches a resolvable forked-from lane and succeeds.
      expect(() => helper.command.export('--fork-lane-new-scope')).to.not.throw();
    });

    it('scope-C should contain the lane-c head Version', () => {
      expect(() => helper.command.catObject(snapOnLaneC, false, scopeCPath)).to.not.throw();
    });

    it('scope-C VersionHistory should be a closed graph despite the local-fork chain', () => {
      const dangling = danglingParentsIn(helper.command.catVersionHistory(`${helper.scopes.remote}/comp1`, scopeCPath));
      expect(dangling, `dangling parent refs in scope-C VH:\n${dangling.join('\n')}`).to.have.lengthOf(0);
    });
  });

  // Consistency: bit status's staged list should match what bit export will actually push.
  // After merging main into a lane (lean lane scope), divergence returns the lane snap plus the
  // main snap(s) merged in. bit export drops the main-origin foreign refs (filterOutForeignMainOriginRefs);
  // bit status currently shows them. The two disagree — fixed by sharing the lean filter.
  describe('bit status staged list should agree with bit export on a lane far behind main', () => {
    let laneScope: string;
    let laneScopePath: string;
    let mergeSnap: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const newScope = helper.scopeHelper.getNewBareScope('-lane-staged');
      laneScope = newScope.scopeName;
      laneScopePath = newScope.scopePath;
      helper.scopeHelper.addRemoteScope(laneScopePath);
      helper.scopeHelper.addRemoteScope(laneScopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, laneScopePath);

      // main snap on scope-C (0.0.1)
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      // lane on scope-L, first export
      helper.command.createLane('dev', `--scope ${laneScope}`);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();

      // main advances on scope-C (0.0.2)
      const laneWs = helper.scopeHelper.cloneWorkspace();
      helper.command.switchLocalLane('main');
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();

      // back on the lane, merge main in — produces mergeSnap. don't export yet; we want to
      // observe bit status BEFORE the push.
      helper.scopeHelper.getClonedWorkspace(laneWs);
      helper.command.import();
      helper.command.mergeLane('main', '--auto-merge-resolve theirs');
      mergeSnap = helper.command.getHeadOfLane('dev', 'comp1');
    });

    it('bit status staged versions should match what bit export will push (lane-origin only)', () => {
      // Divergence returns [mergeSnap, mainSnapPost] ahead of the lane's remote head — the
      // staged versions are reported in tag-or-hash form, so mainSnapPost shows up as "0.0.2".
      // bit export's filterOutForeignMainOriginRefs drops the main-origin entries; only
      // mergeSnap actually pushes. bit status currently shows both — confusing for users who
      // expect "staged" to mean "what will be pushed".
      const status = helper.command.statusJson();
      const comp1Staged = status.stagedComponents.find((c: { id: string }) => c.id.endsWith('/comp1'));
      expect(comp1Staged, `comp1 should be in stagedComponents; got: ${JSON.stringify(status.stagedComponents)}`).to
        .exist;
      expect(comp1Staged.versions).to.eql([mergeSnap]);
    });
  });

  // Same root cause as the bit-status discrepancy, different command. bit reset reads its
  // "what to un-snap" list from getLocalHashes (raw divergence), which on a lane that merged
  // main returns lane-origin snaps PLUS the merged-in main snaps. Resetting removes ALL of
  // them — including the main tag (e.g. 0.0.2) that's already exported on scope-C. After
  // reset, the workspace forgets about a tag that still exists upstream.
  describe('bit reset should not remove main-origin versions merged into a lane', () => {
    let laneScope: string;
    let laneScopePath: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const newScope = helper.scopeHelper.getNewBareScope('-lane-reset');
      laneScope = newScope.scopeName;
      laneScopePath = newScope.scopePath;
      helper.scopeHelper.addRemoteScope(laneScopePath);
      helper.scopeHelper.addRemoteScope(laneScopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, laneScopePath);

      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild(); // 0.0.1
      helper.command.export();

      helper.command.createLane('dev', `--scope ${laneScope}`);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();

      const laneWs = helper.scopeHelper.cloneWorkspace();
      helper.command.switchLocalLane('main');
      helper.command.tagAllWithoutBuild('--unmodified'); // 0.0.2 — only on main
      helper.command.export();

      helper.scopeHelper.getClonedWorkspace(laneWs);
      helper.command.import();
      helper.command.mergeLane('main', '--auto-merge-resolve theirs');
    });

    it('bit reset should leave the merged-in main tag (0.0.2) intact in the component versions', () => {
      // Pre-fix: bit reset's localVersions = [mergeSnap, 0.0.2]. Resetting removes both →
      // workspace loses knowledge of 0.0.2 even though it's exported on main (scope-C).
      // After the fix, reset should only remove the lane-origin mergeSnap.
      helper.command.resetAll();
      const comp1 = helper.command.catComponent('comp1');
      const knownTags = Object.keys(comp1.versions || {});
      expect(knownTags, `comp1.versions after reset: ${JSON.stringify(knownTags)}`).to.include('0.0.2');
      expect(knownTags).to.include('0.0.1');
    });
  });

  // Stress test: three cross-scope chained lane forks. comp1 lives on scope-C; lane-A is on
  // scope-L; lane-B forks lane-A onto scope-M; lane-C forks lane-B onto scope-N. Each export
  // depends on `importAndThrowForMissingHistoryOnLane` walking back to the previous lane's
  // scope for VH. The wrong-scope-refetch failure mode I'm specifically probing: when the
  // closure on scope-N references a lane-A-origin snap, the standard `importMissingHistory`
  // refetch routes to comp1's HOME scope (scope-C) which does NOT have lane-A snaps. If the
  // strict pre-fetch at export time didn't already pull them via the forkedFrom chain, the
  // closure breaks. (This is uncovered by the same-scope chained-forks test above.)
  describe('cross-scope chained lane forks: lane-A on scope-L → lane-B on scope-M → lane-C on scope-N', () => {
    let scopeC: string;
    let scopeCPath: string;
    let scopeL: string;
    let scopeLPath: string;
    let scopeM: string;
    let scopeMPath: string;
    let scopeN: string;
    let scopeNPath: string;
    let laneASnap: string;
    let laneBSnap: string;
    let laneCSnap: string;

    before(() => {
      // scope-C: comp1's home
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      scopeC = helper.scopes.remote;
      scopeCPath = helper.scopes.remotePath;
      // scope-L / scope-M / scope-N: the three lane scopes in the fork chain
      const lNew = helper.scopeHelper.getNewBareScope('-lane-l');
      scopeL = lNew.scopeName;
      scopeLPath = lNew.scopePath;
      const mNew = helper.scopeHelper.getNewBareScope('-lane-m');
      scopeM = mNew.scopeName;
      scopeMPath = mNew.scopePath;
      const nNew = helper.scopeHelper.getNewBareScope('-lane-n');
      scopeN = nNew.scopeName;
      scopeNPath = nNew.scopePath;
      // wire every scope to know every other (full mesh — needed for the strict pre-fetch
      // to walk lane-C.forkedFrom → lane-B → lane-A)
      [scopeLPath, scopeMPath, scopeNPath].forEach((p) => {
        helper.scopeHelper.addRemoteScope(p);
        helper.scopeHelper.addRemoteScope(p, scopeCPath);
        helper.scopeHelper.addRemoteScope(scopeCPath, p);
      });
      [
        [scopeLPath, scopeMPath],
        [scopeLPath, scopeNPath],
        [scopeMPath, scopeLPath],
        [scopeMPath, scopeNPath],
        [scopeNPath, scopeLPath],
        [scopeNPath, scopeMPath],
      ].forEach(([a, b]) => helper.scopeHelper.addRemoteScope(a, b));

      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      // lane-A on scope-L — forks from main, exported
      helper.command.createLane('lane-a', `--scope ${scopeL}`);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      laneASnap = helper.command.getHeadOfLane('lane-a', 'comp1');
      helper.command.export();

      // lane-B on scope-M — forks from lane-A (cross-scope), exported
      helper.command.createLane('lane-b', `--scope ${scopeM} --fork-lane-new-scope`);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      laneBSnap = helper.command.getHeadOfLane('lane-b', 'comp1');
      helper.command.export('--fork-lane-new-scope');

      // lane-C on scope-N — forks from lane-B (cross-scope again), exported
      helper.command.createLane('lane-c', `--scope ${scopeN} --fork-lane-new-scope`);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      laneCSnap = helper.command.getHeadOfLane('lane-c', 'comp1');
      helper.command.export('--fork-lane-new-scope');
    });

    it('scope-N should hold the lane-C head Version', () => {
      expect(() => helper.command.catObject(laneCSnap, false, scopeNPath)).to.not.throw();
    });

    it('scope-N VersionHistory should be a closed graph across the cross-scope chain', () => {
      // The strict pre-fetch must walk lane-C.forkedFrom (lane-B on scope-M), which in turn
      // walks lane-B.forkedFrom (lane-A on scope-L), so that lane-A snaps land on scope-N's
      // VH. If the walk only goes one hop, scope-N would have a dangling parent at laneBSnap
      // → laneASnap (the lane-A snap is on scope-L, not scope-C, so the home-scope refetch
      // can't recover it).
      const dangling = danglingParentsIn(helper.command.catVersionHistory(`${scopeC}/comp1`, scopeNPath));
      expect(dangling, `dangling parent refs in scope-N VH:\n${dangling.join('\n')}`).to.have.lengthOf(0);
    });

    it("scope-N's VH should include lane-A's snap (the deepest ancestor in the fork chain)", () => {
      const vh = helper.command.catVersionHistory(`${scopeC}/comp1`, scopeNPath);
      const hashes = (vh.versions as Array<{ hash: string }>).map((v) => v.hash);
      expect(hashes).to.include(laneCSnap);
      expect(hashes).to.include(laneBSnap);
      expect(hashes).to.include(laneASnap);
    });

    describe('fresh consumer of lane-C', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.scopeHelper.addRemoteScope(scopeLPath);
        helper.scopeHelper.addRemoteScope(scopeMPath);
        helper.scopeHelper.addRemoteScope(scopeNPath);
        helper.command.runCmd(`bit lane import ${scopeN}/lane-c -x`);
      });

      it('bit status should not throw', () => {
        expect(() => helper.command.status()).to.not.throw();
      });

      it('bit lane merge main should find the common ancestor across the three-fork chain', () => {
        expect(() =>
          helper.command.mergeLaneWithoutBuild('main', '--auto-merge-resolve theirs --ignore-config-changes -x')
        ).to.not.throw();
      });
    });
  });

  // Operational risk: a lane's forkedFrom pointer can outlive the upstream lane (delete /
  // rename / scope offline). The strict pre-fetch must NOT hard-block exports in that case;
  // it should degrade to a home-scope fetch and only fail if the closure check actually
  // can't be satisfied. This test simulates the upstream-deleted case.
  describe('forked-from lane deleted upstream — export degrades to home-scope fetch', () => {
    let scopeC: string;
    let scopeCPath: string;
    let scopeL: string;
    let scopeLPath: string;
    let scopeM: string;
    let scopeMPath: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      scopeC = helper.scopes.remote;
      scopeCPath = helper.scopes.remotePath;
      const lNew = helper.scopeHelper.getNewBareScope('-lane-l');
      scopeL = lNew.scopeName;
      scopeLPath = lNew.scopePath;
      const mNew = helper.scopeHelper.getNewBareScope('-lane-m');
      scopeM = mNew.scopeName;
      scopeMPath = mNew.scopePath;
      [scopeLPath, scopeMPath].forEach((p) => {
        helper.scopeHelper.addRemoteScope(p);
        helper.scopeHelper.addRemoteScope(p, scopeCPath);
        helper.scopeHelper.addRemoteScope(scopeCPath, p);
      });
      helper.scopeHelper.addRemoteScope(scopeLPath, scopeMPath);
      helper.scopeHelper.addRemoteScope(scopeMPath, scopeLPath);

      // comp1 on home scope
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      // lane-A on scope-L, exported
      helper.command.createLane('lane-a', `--scope ${scopeL}`);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();

      // lane-B forked to scope-M, exported (lane-B.forkedFrom = scope-L/lane-a)
      helper.command.createLane('lane-b', `--scope ${scopeM} --fork-lane-new-scope`);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export('--fork-lane-new-scope');

      // Delete lane-A from scope-L. lane-B's forkedFrom pointer is now dangling upstream.
      helper.command.runCmd(`bit lane remove ${scopeL}/lane-a --remote --silent --force`);

      // Add comp2 on main and export. comp2 has no on-disk VH on scope-M yet.
      helper.command.switchLocalLane('main');
      helper.fs.outputFile('comp2/index.js', 'console.log("comp2");');
      helper.command.addComponent('comp2');
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      // Back on lane-B: snap comp2 to introduce it into the lane. New external component on
      // scope-M → empty on-disk VH → closure check will see the incoming snap with a dangling
      // parent (the main-snap) and trigger the strict-fetch path. That fetch routes to
      // lane-B.forkedFrom (lane-A on scope-L), which is now gone; with the fallback the
      // home-scope fetch covers the main-snap and closure is satisfied.
      helper.command.switchLocalLane('lane-b');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
    });

    it('exporting lane-B should not fail even though the forked-from lane was deleted upstream', () => {
      expect(() => helper.command.export()).to.not.throw();
    });

    it("scope-M's VersionHistory for comp2 should be closed (home-scope fetch satisfied closure)", () => {
      const dangling = danglingParentsIn(helper.command.catVersionHistory(`${scopeC}/comp2`, scopeMPath));
      expect(dangling, `dangling parent refs in scope-M VH for comp2:\n${dangling.join('\n')}`).to.have.lengthOf(0);
    });
  });
});
