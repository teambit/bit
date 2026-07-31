import chai, { expect } from 'chai';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
import { comp1Src, comp2Src, createGitHostEnvGuard, syncE2eHelpers } from './ci-sync-support';
chai.use(chaiFs);

/**
 * e2e coverage for the state-model-v2 behaviours of `bit ci sync` — where the reconciler's state comes
 * from, rather than the reconcile cycle itself. Same environment contract as `ci-sync.e2e.ts`: a local
 * bare git repo as `origin`, a file:// remote scope, and no git-host credentials (PR-less path).
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
    branchPathsMatching,
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

  // The second half of the block guards the first: dev commits must still be detected on top of the
  // newly advanced state, or "converged" would just be a synonym for "blind".
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
        const changed = helper.command.runCmd(`git show --stat --format= origin/${LANE}`);
        expect(changed, `files in the dev commit:\n${changed}`).to.include('.bitmap');
        expect(branchTipAfterDevWork).to.equal(devCommitSha);
      });

      it('should read the pair as CONVERGED — the developer already did the sync', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        expect(output).to.include(`${LANE} -> noop (converged)`);
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

    // The known Stage-1 delta, locked deliberately: both the invisible round AND the self-heal.
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
        expect(output).to.include(`${LANE}'s tip is not a bit ci sync commit`);
        expect(output).to.include('never snapped stay invisible until the next commit');
      });

      it('should be non-vacuous: the unsnapped edit really is on the branch and really is NOT on the lane', () => {
        expect(fileOnBranch(LANE, 'comp2/index.js')).to.include('never-snapped-edit');
        expect(laneTipFile(devPath, 'comp2/index.js')).to.not.include('never-snapped-edit');
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

  // Two independent defences: deletion requires attribution AND the marker on the tip; an unexported
  // lane pointer is not attribution at all.
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

    describe("the branch tip is a DEVELOPER's .bitmap commit and the lane is then removed", () => {
      let output: string;
      let exitCode: number;
      let tipBefore: string;

      before(() => {
        // An unexported snap: this commit becomes the state commit AND the tip, and the work exists
        // only here.
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
        const changed = helper.command.runCmd(`git show --stat --format= origin/${LANE}`);
        expect(changed, `files in the dev commit:\n${changed}`).to.include('.bitmap');
        expect(branchTipMessage(LANE)).to.not.include('[bit-sync]');
        expect(fileOnBranch(LANE, '.bitmap')).to.include('_bit_lane');
      });

      it('should close the PR but KEEP the branch, naming the tip as the reason', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        expect(output).to.include(`${LANE} -> close-pr`);
        expect(output).to.include(`branch ${LANE} kept: its tip was not written by bit ci sync`);
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

  // The value of this block is entirely in the `makeLocalScopeCold()` call: run the same fixture warm
  // and it passes against broken code too (see `workspace-lane.ts`).
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

      // Diverge on DIFFERENT files, so a correct merge is conflict-free and only the cold-start
      // machinery can fail.
      laneSideEdit(devPath, 'comp1/index.js', comp1Src('cold-lane-snap-2'), 'cold lane snap 2');
      branchSideCommit(LANE, defaultBranch, 'comp2/index.js', comp2Src('cold-branch-dev'), 'feat: dev edits comp2');

      makeLocalScopeCold();
      objectsWhenCold = scopeObjectCount();
      bitmapOnBranch = fileOnBranch(LANE, '.bitmap');

      ({ output, exitCode } = runBit(`bit ci sync ${LANE}`));
      objectsAfterRun = scopeObjectCount();
      gitFetch();
    });

    it('should be non-vacuous: the scope really is cold, and the branch really does name the lane', () => {
      expect(objectsWhenCold, 'the local scope must hold no objects at all when the run starts').to.equal(0);
      expect(bitmapOnBranch, `.bitmap on origin/${LANE}:\n${bitmapOnBranch}`).to.include(LANE);
      expect(bitmapOnBranch).to.include('_bit_lane');
    });

    it('should have had to fetch everything it used, which is what "cold" costs', () => {
      expect(objectsAfterRun, 'the run must have imported objects into the empty scope').to.be.greaterThan(0);
    });

    it('should CONVERGE rather than halt — the guard must read the branch, not the scope cache', () => {
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> merge-diverged`);
      expect(output).to.not.include('HALTED');
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
        expect(exportOutput).to.not.include('Refusing destructive recovery');
      });

      it("should carry the dev commit's content onto the LANE tip", () => {
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

  // The value of this block is entirely in the `--single-branch` flag: run the same fixture off a
  // normal clone and it passes against broken code too. Shallow clones remain unsupported (a different
  // axis: missing commits, not missing refs).
  describe('a single-branch clone reconciles a lane branch its refspec never tracked', () => {
    const LANE = 'narrow-clone';
    let defaultBranch: string;
    let bareRepoPath: string;
    let devPath: string;
    let clonePath: string;
    let configuredRefspec: string;
    let remoteTrackingBeforeRun: string;
    let laneVisibleToLsRemote: string;
    let output: string;
    let exitCode: number;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      bareRepoPath = setupGitRemote();
      setSyncConfig({ lanes: ['*'] });
      defaultBranch = setupComponentsAndInitialCommit();

      // Seed from a normal checkout: the lane branch must pre-exist for its absence to be observable.
      devPath = helper.scopeHelper.cloneWorkspace();
      helper.command.runCmd(`bit lane create ${LANE}`, devPath);
      fs.outputFileSync(path.join(devPath, 'comp1', 'index.js'), comp1Src('narrow-snap-1'));
      helper.command.runCmd('bit snap --message "narrow snap 1"', devPath);
      helper.command.runCmd('bit export', devPath);
      const seed = runBit(`bit ci sync ${LANE}`);
      expect(seed.exitCode, `seeding bit ci sync ${LANE} output:\n${seed.output}`).to.equal(0);

      // Move the lane on, so the narrowed run has real work to do rather than a converged no-op that
      // could pass without ever resolving `origin/<lane>`.
      laneSideEdit(devPath, 'comp1/index.js', comp1Src('narrow-snap-2'), 'narrow snap 2');

      clonePath = path.join(helper.scopes.e2eDir, `narrow-clone-${Date.now()}`);
      helper.command.runCmd(`git clone --single-branch --branch ${defaultBranch} ${bareRepoPath} ${clonePath}`);
      // node_modules is copied rather than installed: ref availability is what is under test.
      const modules = path.join(helper.scopes.localPath, 'node_modules');
      if (fs.existsSync(modules)) fs.copySync(modules, path.join(clonePath, 'node_modules'));
      helper.command.runCmd('bit init', clonePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, clonePath);

      configuredRefspec = helper.command.runCmd('git config --get-all remote.origin.fetch', clonePath).trim();
      remoteTrackingBeforeRun = helper.command.runCmd('git branch -r', clonePath);
      laneVisibleToLsRemote = helper.command.runCmd(`git ls-remote --heads origin ${LANE}`, clonePath).trim();

      ({ output, exitCode } = runBit(`bit ci sync ${LANE}`, clonePath));
      gitFetch();
    });

    it('should be non-vacuous: the clone is really narrowed, and really cannot see the lane branch', () => {
      expect(configuredRefspec).to.equal(`+refs/heads/${defaultBranch}:refs/remotes/origin/${defaultBranch}`);
      expect(remoteTrackingBeforeRun, `git branch -r in the clone:\n${remoteTrackingBeforeRun}`).to.not.include(LANE);
      expect(laneVisibleToLsRemote, 'the remote really does have the lane branch').to.not.equal('');
    });

    it('should CONVERGE rather than halt on a remote-tracking ref the refspec omitted', () => {
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} ->`);
      expect(output).to.not.include('HALTED');
      expect(output.toLowerCase()).to.not.include('unknown revision');
      expect(output.toLowerCase()).to.not.include('ambiguous argument');
    });

    it('should have populated the remote-tracking ref the narrowed refspec left out', () => {
      const remoteBranches = helper.command.runCmd('git branch -r', clonePath);
      expect(remoteBranches, `git branch -r after the run:\n${remoteBranches}`).to.include(LANE);
    });

    it('should have carried the lane move onto the branch, from the narrowed checkout', () => {
      expect(fileOnBranch(LANE, 'comp1/index.js')).to.include('narrow-snap-2');
    });
  });

  // Exercises the import-lane path: the junk is planted BEFORE the run so it is untracked at the
  // moment `checkoutFromRemote` runs, and the startup-warning assertion keeps the cell non-vacuous.
  describe('untracked files in the workspace are discarded rather than pushed onto the branch', () => {
    const LANE = 'no-contamination';
    const JUNK_FILE = 'leftover-note.txt';
    const JUNK_DIR_FILE = 'leftover-residue/from-a-previous-lane.js';
    let devPath: string;
    let output: string;
    let exitCode: number;
    // the default `branchPrefix` is '', so the branch is named exactly after the lane
    const branch = LANE;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      setSyncConfig({ lanes: ['*'] });
      setupComponentsAndInitialCommit();

      devPath = helper.scopeHelper.cloneWorkspace();
      helper.command.runCmd(`bit lane create ${LANE}`, devPath);
      fs.outputFileSync(path.join(devPath, 'comp1', 'index.js'), comp1Src('contamination-guard'));
      helper.command.runCmd('bit snap --message "contamination guard"', devPath);
      helper.command.runCmd('bit export', devPath);

      // Two shapes: a loose file, and a directory of the kind a halted lane leaves behind. Neither is
      // ignored and neither is under `.bit/` or `node_modules/`.
      fs.outputFileSync(path.join(helper.scopes.localPath, JUNK_FILE), 'not part of any lane state\n');
      fs.outputFileSync(path.join(helper.scopes.localPath, JUNK_DIR_FILE), 'export const stale = true;\n');

      ({ output, exitCode } = runBit(`bit ci sync ${LANE}`));
      gitFetch();
    });

    it('should be non-vacuous: git really saw the planted files as uncommitted when the run started', () => {
      expect(output).to.include('uncommitted change');
      expect(output).to.include(JUNK_FILE);
    });

    it('should still reconcile the lane, so the guard is not just a broken run', () => {
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} ->`);
      expect(output).to.not.include('HALTED');
      // the clean did not eat the sync itself
      expect(fileOnBranch(branch, 'comp1/index.js')).to.include('contamination-guard');
    });

    it('should NOT have committed either planted path onto the branch', () => {
      const tree = helper.command.runCmd(`git ls-tree -r --name-only origin/${branch}`);
      expect(branchPathsMatching(branch, 'leftover-note'), `branch tree:\n${tree}`).to.deep.equal([]);
      expect(branchPathsMatching(branch, 'leftover-residue'), `branch tree:\n${tree}`).to.deep.equal([]);
    });

    it('should have removed them from the working tree too', () => {
      expect(path.join(helper.scopes.localPath, JUNK_FILE)).to.not.be.a.path();
      expect(path.join(helper.scopes.localPath, JUNK_DIR_FILE)).to.not.be.a.path();
    });

    it('should have left the local scope and node_modules alone — the clean is scoped, never -x', () => {
      expect(path.join(helper.scopes.localPath, '.bit')).to.be.a.directory();
    });
  });
});
