import chai, { expect } from 'chai';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
import { comp1Src, comp2Src, createGitHostEnvGuard, syncE2eHelpers } from './ci-sync-support';
chai.use(chaiFs);

/**
 * e2e coverage for the **state model v2** behaviours of `bit ci sync` — the ones that are about *where the
 * reconciler's state comes from* rather than about the reconcile cycle itself:
 *
 *   - a developer who snaps and exports from the branch has advanced the branch's own state, and the pair
 *     reads as converged instead of manufacturing a round of merge churn;
 *   - the known Stage-1 delta, where an unsnapped edit riding along with a `.bitmap` commit is invisible
 *     for exactly one round (and self-heals on the next);
 *   - a developer's own `.bitmap` commit must not launder a branch into deletion, in either of its shapes;
 *   - a cold runner — fresh clone, empty local scope — which is what every production run actually is.
 *
 * Split out of `ci-sync.e2e.ts` when that file outgrew the repo's max-lines rule. The fixture drivers are
 * shared via `./ci-sync-support`, so "a dev commit" and "the file on the branch" mean the same thing in both
 * halves. Same environment contract as the sibling suite: a local bare git repo as `origin`, a file://
 * remote scope, and no git-host credentials, so every run takes the PR-less path.
 */
describe('bit ci sync — state model v2', function () {
  this.timeout(0);

  let helper: Helper;
  const envGuard = createGitHostEnvGuard();
  const {
    setupGitRemote,
    setupComponentsAndInitialCommit,
    setSyncConfig,
    runBit,
    gitFetch,
    remoteBranchExists,
    branchTipSha,
    branchTipMessage,
    fileOnBranch,
    remoteLaneFingerprint,
    laneTipFile,
    laneSideEdit,
    branchSideCommit,
    makeLocalScopeCold,
    scopeObjectCount,
  } = syncE2eHelpers(() => helper);

  before(() => {
    envGuard.save();
    helper = new Helper();
  });

  after(() => {
    envGuard.restore();
    helper.scopeHelper.destroy();
  });

  // =============================================================================================
  // THE STATE-MODEL-V2 CELL. A developer who works on the branch *with bit* — `bit snap`, `bit export`,
  // then commit the resulting `.bitmap` — has legitimately advanced the branch's own bit state to the
  // lane's. Since the reconciler derives that state from `.bitmap` rather than from what it last wrote in
  // a commit trailer, it sees the pair as CONVERGED.
  //
  // Under the trailer-derived model the same branch read as "the lane moved (it did — the developer
  // exported) AND the branch has dev commits", i.e. `merge-diverged`: a full lane-into-branch merge, a
  // snap, an export and a push, all to arrive back where the developer already was. That is the churn this
  // model removes, and it is not cosmetic — every one of those rounds advances the lane and rewrites the
  // branch under a developer who did nothing wrong.
  //
  // The second half of the block is the guard on the first: dev commits must still be *detected* on top of
  // the newly advanced state, or "converged" would just be a synonym for "blind".
  // =============================================================================================
  describe("a developer who snaps and exports from the branch advances the branch's own state", () => {
    const LANE = 'dev-snap';
    let defaultBranch: string;
    let devPath: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      setSyncConfig({ lanes: ['*'] });
      defaultBranch = setupComponentsAndInitialCommit();

      devPath = helper.scopeHelper.cloneWorkspace();
      helper.command.runCmd(`bit lane create ${LANE}`, devPath);
      fs.outputFileSync(path.join(devPath, 'comp1', 'index.js'), comp1Src('lane-snap-1'));
      helper.command.runCmd('bit snap --message "lane snap 1"', devPath);
      helper.command.runCmd('bit export', devPath);

      const first = runBit(`bit ci sync ${LANE}`);
      expect(first.exitCode, `bit ci sync ${LANE} output:\n${first.output}`).to.equal(0);
      gitFetch();
    });

    describe('the developer snaps + exports on the branch and commits the .bitmap it produced', () => {
      let output: string;
      let exitCode: number;
      let devCommitSha: string;
      let laneAfterDevWork: string;
      let branchTipAfterDevWork: string;

      before(() => {
        // Exactly what a developer does on a lane branch: check it out (its committed `.bitmap` puts the
        // workspace on the lane), edit, snap, export, then commit — `.bitmap` included, because the snap
        // rewrote it.
        gitFetch();
        helper.command.runCmd(`git checkout -f -B ${LANE} origin/${LANE}`);
        helper.fs.outputFile('comp2/index.js', comp2Src('dev-snapped-on-branch'));
        helper.command.runCmd('bit snap --message "dev snaps comp2 on the branch"');
        helper.command.runCmd('bit export');
        helper.command.runCmd('git add -A');
        helper.command.runCmd('git commit -m "feat: snap comp2 from the branch"');
        helper.command.runCmd(`git push origin ${LANE}`);
        devCommitSha = helper.command.runCmd('git rev-parse HEAD').trim();
        helper.command.runCmd(`git checkout -f ${defaultBranch}`);
        gitFetch();

        laneAfterDevWork = remoteLaneFingerprint(LANE);
        branchTipAfterDevWork = branchTipSha(LANE);
        ({ output, exitCode } = runBit(`bit ci sync ${LANE}`));
        gitFetch();
      });

      it('should be non-vacuous: the dev commit really did move .bitmap, and it is the branch tip', () => {
        // Both halves matter. If the commit had not touched `.bitmap` this would be scenario C
        // (`export-branch`) wearing a different hat; if it were not the tip, `hasDevCommits` would be true
        // for an unrelated reason.
        const changed = helper.command.runCmd(`git show --stat --format= origin/${LANE}`);
        expect(changed, `files in the dev commit:\n${changed}`).to.include('.bitmap');
        expect(branchTipAfterDevWork).to.equal(devCommitSha);
      });

      it('should read the pair as CONVERGED — the developer already did the sync', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        expect(output).to.include(`${LANE} -> noop (converged)`);
        // The v1 outcome this replaces. Naming it keeps the test honest about what regressed if it fires.
        expect(output).to.not.include(`${LANE} -> merge-diverged`);
        expect(output).to.not.include(`${LANE} -> export-branch`);
        expect(output).to.not.include(`${LANE} -> import-lane`);
      });

      it('should write nothing: no commit on the branch, no snap on the lane', () => {
        expect(branchTipSha(LANE)).to.equal(branchTipAfterDevWork);
        expect(remoteLaneFingerprint(LANE)).to.equal(laneAfterDevWork);
      });

      it("should have left the developer's content in place on both sides", () => {
        expect(fileOnBranch(LANE, 'comp2/index.js')).to.include('dev-snapped-on-branch');
        expect(laneTipFile(devPath, 'comp2/index.js')).to.include('dev-snapped-on-branch');
      });
    });

    describe('and a plain dev commit on top of that new state is still exported', () => {
      let output: string;
      let exitCode: number;
      let devCommitSha: string;
      let laneBefore: string;

      before(() => {
        laneBefore = remoteLaneFingerprint(LANE);
        devCommitSha = branchSideCommit(
          LANE,
          defaultBranch,
          'comp2/index.js',
          comp2Src('plain-dev-edit-after-snap'),
          'feat: edit comp2 without snapping'
        );
        ({ output, exitCode } = runBit(`bit ci sync ${LANE}`));
        gitFetch();
      });

      it('should export the branch onto the lane: the state commit is the baseline, not the sync commit', () => {
        // The baseline the dev commit sits on top of is the DEVELOPER's `.bitmap` commit from the previous
        // block — a commit the reconciler never wrote. Anchoring on "the last commit we wrote" would have
        // counted the developer's own commit as a dev commit forever.
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        expect(output).to.include(`${LANE} -> export-branch`);
      });

      it("should snap the plain edit onto the lane and keep the dev commit in the branch's history", () => {
        expect(remoteLaneFingerprint(LANE)).to.not.equal(laneBefore);
        expect(laneTipFile(devPath, 'comp2/index.js')).to.include('plain-dev-edit-after-snap');
        expect(helper.command.runCmd(`git log origin/${LANE} --format=%H`)).to.include(devCommitSha);
      });

      describe('re-running once more', () => {
        let rerun: { output: string; exitCode: number };
        let shaBefore: string;
        before(() => {
          shaBefore = branchTipSha(LANE);
          rerun = runBit(`bit ci sync ${LANE}`);
          gitFetch();
        });
        it('should be a converged no-op — the pair settles, it does not oscillate', () => {
          expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
          expect(rerun.output).to.include(`${LANE} -> noop (converged)`);
          expect(branchTipSha(LANE)).to.equal(shaBefore);
        });
      });
    });

    /**
     * THE KNOWN STAGE-1 DELTA, locked deliberately rather than left undiscovered.
     *
     * `hasDevCommits` counts commits *above* the state commit, so a single commit that BOTH advances the
     * branch's bit state (snap + export, rewriting `.bitmap`) AND carries a source edit nobody snapped is its
     * own state commit — the edit rides along invisibly. The pair reads as converged at the bit level, which
     * it genuinely is, while that edit has not reached the lane.
     *
     * It is neither lost nor permanent: the edit is committed in git, nothing is force-pushed, and the next
     * commit on the branch makes `hasDevCommits` true and the export picks it up. The cell below locks both
     * halves — the invisible round AND the self-heal — so the behavior is a documented property rather than a
     * surprise, and so a future fix has something to change.
     *
     * The real fix is not a planner change: telling "the branch is ahead of the lane" from "the lane is ahead
     * of the branch" needs snap-graph reachability (is the branch's snap a descendant of the lane's head?),
     * which is a bit API question deferred to Stage 1. What the run CAN do cheaply — and now does — is stop
     * claiming more than it knows, by saying out loud that the tip is not one of its own commits.
     */
    describe('an unsnapped edit riding along with a .bitmap commit is invisible for one round', () => {
      let output: string;
      let exitCode: number;
      let laneAfterDevWork: string;
      let branchTipAfterDevWork: string;

      before(() => {
        gitFetch();
        helper.command.runCmd(`git checkout -f -B ${LANE} origin/${LANE}`);
        // comp1 is snapped AND exported, so `.bitmap` moves and the branch's state matches the lane's ...
        helper.fs.outputFile('comp1/index.js', comp1Src('snapped-and-exported'));
        helper.command.runCmd('bit snap --message "dev snaps comp1"');
        helper.command.runCmd('bit export');
        // ... and only THEN comp2 is edited, so it is in the same git commit but in no snap.
        helper.fs.outputFile('comp2/index.js', comp2Src('never-snapped-edit'));
        helper.command.runCmd('git add -A');
        helper.command.runCmd('git commit -m "feat: snap comp1, and edit comp2 without snapping it"');
        helper.command.runCmd(`git push origin ${LANE}`);
        helper.command.runCmd(`git checkout -f ${defaultBranch}`);
        gitFetch();

        laneAfterDevWork = remoteLaneFingerprint(LANE);
        branchTipAfterDevWork = branchTipSha(LANE);
        ({ output, exitCode } = runBit(`bit ci sync ${LANE}`));
        gitFetch();
      });

      it('should read as converged — which is true of the BIT state, and is the delta', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        expect(output).to.include(`${LANE} -> noop (converged)`);
        expect(branchTipSha(LANE)).to.equal(branchTipAfterDevWork);
        expect(remoteLaneFingerprint(LANE)).to.equal(laneAfterDevWork);
      });

      it('should SAY that the tip is not one of its own commits, rather than claiming a bare convergence', () => {
        // The cheap half of the honesty fix: no planner change, but the run stops implying it has seen
        // everything on the branch when the tip is a commit it did not write.
        expect(output).to.include(`${LANE}'s tip is not a bit ci sync commit`);
        expect(output).to.include('never snapped stay invisible until the next commit');
      });

      it('should be non-vacuous: the unsnapped edit really is on the branch and really is NOT on the lane', () => {
        expect(fileOnBranch(LANE, 'comp2/index.js')).to.include('never-snapped-edit');
        expect(laneTipFile(devPath, 'comp2/index.js')).to.not.include('never-snapped-edit');
        // the snapped half DID reach the lane, so the two are genuinely being told apart
        expect(laneTipFile(devPath, 'comp1/index.js')).to.include('snapped-and-exported');
      });

      describe('the next ordinary commit on the branch', () => {
        let heal: { output: string; exitCode: number };
        before(() => {
          branchSideCommit(LANE, defaultBranch, 'docs/note.md', 'a plain commit\n', 'docs: an ordinary commit');
          heal = runBit(`bit ci sync ${LANE}`);
          gitFetch();
        });

        it('should self-heal: the export carries the previously invisible edit onto the lane', () => {
          expect(heal.exitCode, `bit ci sync output:\n${heal.output}`).to.equal(0);
          expect(heal.output).to.include(`${LANE} -> export-branch`);
          expect(laneTipFile(devPath, 'comp2/index.js')).to.include('never-snapped-edit');
        });
      });
    });
  });

  // =============================================================================================
  // OWNERSHIP LAUNDERING. `close-pr` deletes branches, and the v2 evidence is `.bitmap`-derived — which means
  // a DEVELOPER can write it. `bit create`, an unexported `bit snap`, `bit deps set`: each rewrites `.bitmap`,
  // so the developer's own commit becomes the state commit, the tip IS the state commit (no dev commits above
  // it), and the lane pointer they inherited is still in the file. Every structural test then reads
  // `own-live` with nothing above it — the exact shape whose branch gets deleted when the lane goes away.
  //
  // Worse, `bit lane create foo` writes `_bit_lane` with `exported: false` before the lane has ever been
  // pushed, so a developer branch can carry a pointer to a lane that has never existed on any remote — and
  // "not on the remote" is precisely how the reconciler recognizes a REMOVED lane.
  //
  // Two independent defences, both locked here:
  //   1. deletion requires bit-native attribution AND the `[bit-sync]` marker on the tip (the one place a
  //      marker is consulted, and it can only ever withhold a deletion);
  //   2. an unexported lane pointer is not attribution at all — a lane that was never exported cannot have
  //      been removed.
  // =============================================================================================
  describe("a developer's own .bitmap commit must not launder a branch into deletion", () => {
    const LANE = 'launder';
    /** a developer branch whose `.bitmap` points at a lane that was never exported anywhere */
    const UNEXPORTED_BRANCH = 'never-pushed';
    let defaultBranch: string;
    let devPath: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      setSyncConfig({ lanes: ['*'] });
      defaultBranch = setupComponentsAndInitialCommit();

      devPath = helper.scopeHelper.cloneWorkspace();
      helper.command.runCmd(`bit lane create ${LANE}`, devPath);
      fs.outputFileSync(path.join(devPath, 'comp1', 'index.js'), comp1Src('launder-snap'));
      helper.command.runCmd('bit snap --message "launder lane snap"', devPath);
      helper.command.runCmd('bit export', devPath);

      const first = runBit(`bit ci sync ${LANE}`);
      expect(first.exitCode, `bit ci sync ${LANE} output:\n${first.output}`).to.equal(0);
      gitFetch();
    });

    // -------------------------------------------------------------------------------------------
    describe("the branch tip is a DEVELOPER's .bitmap commit and the lane is then removed", () => {
      let output: string;
      let exitCode: number;
      let tipBefore: string;

      before(() => {
        // An unexported `bit snap` on the branch: it rewrites `.bitmap`, so this commit becomes the state
        // commit AND the tip. The work exists only here — it was never exported to the lane.
        gitFetch();
        helper.command.runCmd(`git checkout -f -B ${LANE} origin/${LANE}`);
        helper.fs.outputFile('comp2/index.js', comp2Src('unexported-local-snap'));
        helper.command.runCmd('bit snap --message "dev snaps comp2 but never exports it"');
        helper.command.runCmd('git add -A');
        helper.command.runCmd('git commit -m "feat: local snap that was never exported"');
        helper.command.runCmd(`git push origin ${LANE}`);
        helper.command.runCmd(`git checkout -f ${defaultBranch}`);
        gitFetch();
        tipBefore = branchTipSha(LANE);

        helper.command.removeRemoteLane(LANE, '--force');
        ({ output, exitCode } = runBit(`bit ci sync ${LANE}`));
        gitFetch();
      });

      it('should be non-vacuous: the tip really is the state commit, and it still carries the lane pointer', () => {
        // Without both of these the branch would be kept for an ordinary reason (dev commits above the
        // state commit, or no attribution at all) and this test would prove nothing about the marker.
        const changed = helper.command.runCmd(`git show --stat --format= origin/${LANE}`);
        expect(changed, `files in the dev commit:\n${changed}`).to.include('.bitmap');
        expect(branchTipMessage(LANE)).to.not.include('[bit-sync]');
        expect(fileOnBranch(LANE, '.bitmap')).to.include('_bit_lane');
      });

      it('should close the PR but KEEP the branch, naming the tip as the reason', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        expect(output).to.include(`${LANE} -> close-pr`);
        expect(output).to.include(`branch ${LANE} kept: its tip was not written by bit ci sync`);
        // and NOT the other keep reason, which would send a maintainer looking for the wrong thing
        expect(output).to.not.include('branch carries unmerged commits');
      });

      it('should leave the branch and the never-exported work exactly in place', () => {
        expect(remoteBranchExists(LANE), `origin/${LANE} must survive — its snap exists nowhere else`).to.be.true;
        expect(branchTipSha(LANE)).to.equal(tipBefore);
        expect(fileOnBranch(LANE, 'comp2/index.js')).to.include('unexported-local-snap');
      });

      describe('re-running while the lane is still gone', () => {
        let rerun: { output: string; exitCode: number };
        before(() => {
          rerun = runBit('bit ci sync --all');
          gitFetch();
        });
        it('should keep keeping it — idempotent, and still never deleted', () => {
          expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
          expect(rerun.output).to.include(`branch ${LANE} kept`);
          expect(remoteBranchExists(LANE)).to.be.true;
          expect(branchTipSha(LANE)).to.equal(tipBefore);
        });
      });
    });

    // -------------------------------------------------------------------------------------------
    /**
     * `bit lane create` marks the pointer `exported: false`. A branch carrying that commit names a lane that
     * has never existed on any remote — so "the remote does not have it" means "it was never pushed", not
     * "it was removed", and nothing about the branch may be retired on the strength of it.
     */
    describe('a developer branch whose .bitmap points at a lane that was never exported', () => {
      let output: string;
      let exitCode: number;
      let tipBefore: string;

      before(() => {
        gitFetch();
        helper.command.runCmd(`git checkout -f -B ${UNEXPORTED_BRANCH} origin/${defaultBranch}`);
        helper.command.runCmd(`bit lane create ${UNEXPORTED_BRANCH}`);
        helper.fs.outputFile('comp1/index.js', comp1Src('work-on-a-never-pushed-lane'));
        helper.command.runCmd('git add -A');
        helper.command.runCmd('git commit -m "feat: start a lane locally, never export it"');
        helper.command.runCmd(`git push origin ${UNEXPORTED_BRANCH}`);
        tipBefore = helper.command.runCmd('git rev-parse HEAD').trim();
        // put the workspace back the way a fresh CI checkout would find it
        helper.command.runCmd('bit switch main');
        helper.command.runCmd(`git checkout -f ${defaultBranch}`);
        gitFetch();

        ({ output, exitCode } = runBit('bit ci sync --all'));
        gitFetch();
      });

      it('should be non-vacuous: the branch really does carry an UNEXPORTED lane pointer', () => {
        const bitmap = fileOnBranch(UNEXPORTED_BRANCH, '.bitmap');
        expect(bitmap).to.include('_bit_lane');
        expect(bitmap).to.include(UNEXPORTED_BRANCH);
        expect(bitmap.replace(/\s+/g, '')).to.include('"exported":false');
      });

      it('should ignore the branch entirely rather than read it as a removed lane', () => {
        expect(exitCode, `bit ci sync --all output:\n${output}`).to.equal(0);
        expect(output).to.include(`${UNEXPORTED_BRANCH} -> noop`);
        expect(output).to.not.include(`${UNEXPORTED_BRANCH} -> close-pr`);
      });

      it('should leave the branch and its work exactly as the developer pushed them', () => {
        expect(remoteBranchExists(UNEXPORTED_BRANCH), `origin/${UNEXPORTED_BRANCH} must still exist`).to.be.true;
        expect(branchTipSha(UNEXPORTED_BRANCH)).to.equal(tipBefore);
        expect(fileOnBranch(UNEXPORTED_BRANCH, 'comp1/index.js')).to.include('work-on-a-never-pushed-lane');
      });
    });
  });

  // =============================================================================================
  // COLD START — the state every production run is actually in.
  //
  // `bit ci sync` runs on an ephemeral GitHub runner: fresh clone, `bit init`, local scope that has never
  // imported a thing. This suite's other 40-odd scenarios all run against one long-lived warm workspace, so
  // a dependency on a cached lane object is invisible to every one of them — which is exactly what happened.
  // On a cold runner `bit ci sync <lane>` classified the pair as merge-diverged and then halted with
  //
  //     failed to merge lane <scope>/<lane> into branch <lane>:
  //     the branch's .bitmap points at "main" rather than <scope>/<lane>
  //
  // about a branch whose committed `.bitmap` provably carried the lane pointer. The guard was asking
  // `lanes.getCurrentLane()`, which reads the pointer from `.bitmap` and then resolves it through the LOCAL
  // SCOPE's copy of the lane object; with no object it answered "main" and the guard reported a fact about
  // the scope cache as a fact about the branch. See `workspace-lane.ts`.
  //
  // This block is the regression lock, and its value is entirely in the `makeLocalScopeCold()` call: run the
  // same fixture warm and it passes against the broken code too.
  // =============================================================================================
  describe('a cold runner (fresh clone, empty local scope) reconciles a diverged pair', () => {
    const LANE = 'cold-start';
    let defaultBranch: string;
    let devPath: string;
    let output: string;
    let exitCode: number;
    let objectsWhenCold: number;
    let objectsAfterRun: number;
    let bitmapOnBranch: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      setSyncConfig({ lanes: ['*'] });
      defaultBranch = setupComponentsAndInitialCommit();

      devPath = helper.scopeHelper.cloneWorkspace();
      helper.command.runCmd(`bit lane create ${LANE}`, devPath);
      fs.outputFileSync(path.join(devPath, 'comp1', 'index.js'), comp1Src('cold-lane-snap-1'));
      helper.command.runCmd('bit snap --message "cold lane snap 1"', devPath);
      helper.command.runCmd('bit export', devPath);

      const first = runBit(`bit ci sync ${LANE}`);
      expect(first.exitCode, `bit ci sync ${LANE} output:\n${first.output}`).to.equal(0);
      gitFetch();

      // Diverge on DIFFERENT files, so a correct merge is conflict-free and the only thing that can fail
      // is the cold-start machinery itself.
      laneSideEdit(devPath, 'comp1/index.js', comp1Src('cold-lane-snap-2'), 'cold lane snap 2');
      branchSideCommit(LANE, defaultBranch, 'comp2/index.js', comp2Src('cold-branch-dev'), 'feat: dev edits comp2');

      // THE POINT OF THE BLOCK. Everything above built the fixture on a warm workspace; the run below is
      // the first one that starts where production starts.
      makeLocalScopeCold();
      objectsWhenCold = scopeObjectCount();
      bitmapOnBranch = fileOnBranch(LANE, '.bitmap');

      ({ output, exitCode } = runBit(`bit ci sync ${LANE}`));
      objectsAfterRun = scopeObjectCount();
      gitFetch();
    });

    it('should be non-vacuous: the scope really is cold, and the branch really does name the lane', () => {
      // Without the first assertion this is just scenario D1 again. Without the second, a halt would be
      // *correct* and the test would be locking the wrong thing — this is the exact pair of facts that
      // made the production failure a bug rather than a true refusal.
      expect(objectsWhenCold, 'the local scope must hold no objects at all when the run starts').to.equal(0);
      expect(bitmapOnBranch, `.bitmap on origin/${LANE}:\n${bitmapOnBranch}`).to.include(LANE);
      expect(bitmapOnBranch).to.include('_bit_lane');
    });

    it('should have had to fetch everything it used, which is what "cold" costs', () => {
      // The other half of the coldness claim: the run cannot have been reading a cached lane object,
      // because there was nothing cached to read.
      expect(objectsAfterRun, 'the run must have imported objects into the empty scope').to.be.greaterThan(0);
    });

    it('should CONVERGE rather than halt — the guard must read the branch, not the scope cache', () => {
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> merge-diverged`);
      expect(output).to.not.include('HALTED');
      // the exact production symptom, named so a regression is unmistakable in the failure output
      expect(output).to.not.include(`the branch's .bitmap points at "main"`);
    });

    it('should merge both sides on a scope that had never seen the lane', () => {
      expect(output).to.include('with no conflicts');
      expect(fileOnBranch(LANE, 'comp1/index.js')).to.include('cold-lane-snap-2');
      expect(fileOnBranch(LANE, 'comp2/index.js')).to.include('cold-branch-dev');
    });

    it('should advance the lane, keeping the lane-side edit alive on its tip', () => {
      expect(laneTipFile(devPath, 'comp1/index.js')).to.include('cold-lane-snap-2');
      expect(laneTipFile(devPath, 'comp2/index.js')).to.include('cold-branch-dev');
    });

    describe('re-running on the now-warm workspace', () => {
      let rerun: { output: string; exitCode: number };
      let shaBefore: string;
      before(() => {
        shaBefore = branchTipSha(LANE);
        rerun = runBit(`bit ci sync ${LANE}`);
        gitFetch();
      });
      it('should be a converged no-op — cold and warm agree on the state', () => {
        expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
        expect(rerun.output).to.include(`${LANE} -> noop (converged)`);
        expect(branchTipSha(LANE)).to.equal(shaBefore);
      });
    });

    /**
     * The other half of the audit: `import-lane` onto an EXISTING branch reads the current lane too, to
     * decide whether it must step off to main before re-importing. Cold, the scope-object read said "main"
     * for a branch already on the lane, so it skipped the step-off, `switchLanes` threw "already checked
     * out" (which `switchToLane` reports as success), nothing was materialized, and the run halted blaming
     * the switch. That is the commonest action there is, broken on every fresh runner.
     */
    describe('and import-lane onto an existing branch, also cold', () => {
      let importOutput: string;
      let importExit: number;
      before(() => {
        // Only the lane moves, so the plan is import-lane onto the branch that already exists.
        laneSideEdit(devPath, 'comp1/index.js', comp1Src('cold-lane-snap-3'), 'cold lane snap 3');
        makeLocalScopeCold();
        ({ output: importOutput, exitCode: importExit } = runBit(`bit ci sync ${LANE}`));
        gitFetch();
      });

      it('should import the lane onto the existing branch instead of halting', () => {
        expect(importExit, `bit ci sync output:\n${importOutput}`).to.equal(0);
        expect(importOutput).to.include(`${LANE} -> import-lane`);
        expect(importOutput).to.not.include('HALTED');
        expect(importOutput).to.not.include('reported success but the workspace is on');
      });

      it("should put the lane's new content on the branch", () => {
        expect(fileOnBranch(LANE, 'comp1/index.js')).to.include('cold-lane-snap-3');
      });
    });

    /**
     * The third cold path, and the one whose trap is subtlest: `export-branch`.
     *
     * `snapPrCommit` reuses the remote lane through `switchToLane`, which is documented as fetching the
     * latest lane head. On this path it never does: the workspace is ALREADY on the lane (the branch's
     * `.bitmap` put it there), so `switchLanes` throws "already checked out" from
     * `throwForSwitchingToCurrentLane` — inside `populatePropsAccordingToLocalLane`, i.e. **before any
     * fetch** — and `switchToLane` reports that throw as success. Nothing is imported, the `landedOnLane`
     * probe then asks the local scope for a lane object that isn't there, and `noDestructiveRecovery` turns
     * the phantom "failed to switch" into a halt. The developer's commit never reaches the lane.
     *
     * This is why "the switch has just warmed the scope" is not a safe assumption: a switch that no-ops
     * warms nothing. The fix imports the lane before delegating, so the probe passes because the lane is
     * really there and the snap/export runs against the lane's real remote state.
     */
    describe('and export-branch, also cold', () => {
      let exportOutput: string;
      let exportExit: number;
      let devCommitSha: string;
      let tipBeforeSync: string;

      before(() => {
        // Only the branch moves, so the plan is export-branch: snap the dev commit onto the lane.
        devCommitSha = branchSideCommit(
          LANE,
          defaultBranch,
          'comp2/index.js',
          comp2Src('cold-branch-dev-2'),
          'feat: comp2 again'
        );
        tipBeforeSync = branchTipSha(LANE);
        makeLocalScopeCold();
        ({ output: exportOutput, exitCode: exportExit } = runBit(`bit ci sync ${LANE}`));
        gitFetch();
      });

      it('should export instead of halting on a phantom failed switch', () => {
        expect(exportExit, `bit ci sync output:\n${exportOutput}`).to.equal(0);
        expect(exportOutput).to.include(`${LANE} -> export-branch`);
        expect(exportOutput).to.not.include('HALTED');
        // the exact pre-fix symptom, named so a regression is unmistakable
        expect(exportOutput).to.not.include('Refusing destructive recovery');
      });

      it("should carry the dev commit's content onto the LANE tip", () => {
        // The whole point of export-branch. A halt here loses the developer's work silently until a human
        // notices the red run.
        expect(laneTipFile(devPath, 'comp2/index.js')).to.include('cold-branch-dev-2');
      });

      it('should record the new state on the branch above the dev commit', () => {
        expect(branchTipSha(LANE)).to.not.equal(tipBeforeSync);
        expect(branchTipMessage(LANE)).to.include('[bit-sync]');
        // never force-pushed: the developer's commit is still in the history
        expect(helper.command.runCmd(`git log origin/${LANE} --format=%H`)).to.include(devCommitSha);
      });
    });
  });
});
