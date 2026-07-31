import chai, { expect } from 'chai';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
import { NO_GIT_HOST_WARNING, comp1Src, comp2Src, createGitHostEnvGuard, syncE2eHelpers } from './ci-sync-support';
chai.use(chaiFs);

/**
 * e2e coverage for `bit ci sync`. Every scenario runs against a local bare git repo as `origin` and a
 * file:// remote scope, with the git-host env unset for the suite's duration — the PR-less path, which
 * is the half these tests can assert on without a network. Assertions are deliberately about file
 * content on the pushed branch and lane tip, not just about commits existing: a `.bitmap`-only commit
 * or a snap-before-merge both pass any commit-existence check.
 */
describe('bit ci sync', function () {
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
    remoteRefs,
    branchTipSha,
    branchTipMessage,
    laneHeadTrailer,
    fileOnBranch,
    branchPathsMatching,
    remoteLaneFingerprint,
    laneTipFile,
    laneSideEdit,
    branchSideCommit,
  } = syncE2eHelpers(() => helper);

  before(() => {
    envGuard.save();
    helper = new Helper();
  });

  after(() => {
    envGuard.restore();
    helper.scopeHelper.destroy();
  });

  // Successive states of the same lane/branch pair: one workspace, run in order — the only way to
  // prove the reconciler is stateless is to drive one pair through a whole lifecycle.
  describe('lane <-> branch reconcile cycle (scenarios A, B, C, D1, D2, lane-deleted)', () => {
    const LANE = 'sync-cycle';
    let defaultBranch: string;
    let devPath: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      setSyncConfig({ lanes: ['*'] });
      defaultBranch = setupComponentsAndInitialCommit();

      // The "developer on bit.cloud" whose lane the reconciler mirrors.
      devPath = helper.scopeHelper.cloneWorkspace();
      helper.command.runCmd(`bit lane create ${LANE}`, devPath);
      fs.outputFileSync(path.join(devPath, 'comp1', 'index.js'), comp1Src('lane-snap-1'));
      helper.command.runCmd('bit snap --message "lane snap 1"', devPath);
      helper.command.runCmd('bit export', devPath);
    });

    describe('scenario A: remote lane, no branch -> import-lane creates the branch', () => {
      let output: string;
      let exitCode: number;
      before(() => {
        ({ output, exitCode } = runBit(`bit ci sync ${LANE}`));
        gitFetch();
      });

      it('should succeed and report the import-lane action', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        expect(output).to.include(`${LANE} -> import-lane`);
      });

      it('should run PR-less: no git host provider configured, PR creation skipped', () => {
        expect(output).to.include(NO_GIT_HOST_WARNING);
        expect(output).to.include(`skipping PR creation for ${LANE}`);
      });

      it('should push a branch named after the lane', () => {
        expect(remoteBranchExists(LANE)).to.be.true;
      });

      it('should tip the branch with a [bit-sync] commit carrying a Bit-Lane-Head trailer', () => {
        const message = branchTipMessage(LANE);
        expect(message).to.include('[bit-sync]');
        expect(message).to.include('Bit-Lane-Head:');
        expect(laneHeadTrailer(LANE)).to.be.a('string').with.lengthOf(40);
      });

      // A `forceOurs` switch produces a `.bitmap`-only commit whose files still hold the default
      // branch's content; only asserting on file bytes can see that.
      it("should put the LANE's file content in the branch's tree, not just a .bitmap bump", () => {
        const onBranch = fileOnBranch(LANE, 'comp1/index.js');
        expect(onBranch, `comp1/index.js on origin/${LANE}:\n${onBranch}`).to.include('lane-snap-1');
        expect(onBranch).to.not.include('comp1: initial');
        // non-vacuous: the fork point still holds the pre-lane content.
        expect(fileOnBranch(defaultBranch, 'comp1/index.js')).to.include('comp1: initial');
      });

      it('should commit the lane pointer in .bitmap so later runs can merge into the branch', () => {
        expect(fileOnBranch(LANE, '.bitmap')).to.include(LANE);
      });

      it('should leave the workspace restored: git on the default branch, bit on main', () => {
        expect(helper.command.runCmd('git branch --show-current').trim()).to.equal(defaultBranch);
        expect(helper.command.listLanesParsed().currentLane).to.equal('main');
      });
    });

    describe('scenario B: re-run with nothing moved -> converged no-op', () => {
      let output: string;
      let exitCode: number;
      let shaBefore: string;
      let laneBefore: string;
      before(() => {
        shaBefore = branchTipSha(LANE);
        laneBefore = remoteLaneFingerprint(LANE);
        ({ output, exitCode } = runBit(`bit ci sync ${LANE}`));
        gitFetch();
      });

      it('should succeed and report a converged no-op', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        expect(output).to.include(`${LANE} -> noop (converged)`);
      });

      it('should recognize the branch tip as one of its own sync commits', () => {
        expect(output).to.include('branch tip is a bit-sync commit');
      });

      it('should not move the branch or the lane', () => {
        expect(branchTipSha(LANE)).to.equal(shaBefore);
        expect(remoteLaneFingerprint(LANE)).to.equal(laneBefore);
      });
    });

    describe('scenario C: dev commit on the branch -> export-branch snaps it onto the lane', () => {
      let output: string;
      let exitCode: number;
      let devCommitSha: string;
      let laneBefore: string;
      let trailerBefore: string | undefined;
      before(() => {
        laneBefore = remoteLaneFingerprint(LANE);
        trailerBefore = laneHeadTrailer(LANE);
        devCommitSha = branchSideCommit(
          LANE,
          defaultBranch,
          'comp2/index.js',
          comp2Src('branch-dev-1'),
          'feat: dev edits comp2 on the branch'
        );
        ({ output, exitCode } = runBit(`bit ci sync ${LANE}`));
        gitFetch();
      });

      it('should succeed and report the export-branch action', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        expect(output).to.include(`${LANE} -> export-branch`);
      });

      it('should advance the remote lane head', () => {
        expect(remoteLaneFingerprint(LANE)).to.not.equal(laneBefore);
      });

      it("should snap the dev commit's content onto the lane", () => {
        expect(laneTipFile(devPath, 'comp2/index.js')).to.include('branch-dev-1');
      });

      it('should record a FRESH Bit-Lane-Head trailer commit on top of the dev commit', () => {
        const tip = branchTipSha(LANE);
        expect(tip).to.not.equal(devCommitSha);
        expect(branchTipMessage(LANE)).to.include('[bit-sync]');
        const trailerAfter = laneHeadTrailer(LANE);
        expect(trailerAfter).to.be.a('string');
        expect(trailerAfter).to.not.equal(trailerBefore);
      });

      it('should keep the dev commit in the branch history (never force-pushed away)', () => {
        const log = helper.command.runCmd(`git log origin/${LANE} --format=%H`);
        expect(log).to.include(devCommitSha);
      });

      describe('re-running right after export-branch', () => {
        let rerun: { output: string; exitCode: number };
        let shaBefore: string;
        before(() => {
          shaBefore = branchTipSha(LANE);
          rerun = runBit(`bit ci sync ${LANE}`);
          gitFetch();
        });
        it('should be a converged no-op', () => {
          expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
          expect(rerun.output).to.include(`${LANE} -> noop (converged)`);
          expect(branchTipSha(LANE)).to.equal(shaBefore);
        });
      });
    });

    describe('scenario D1: both sides moved on DIFFERENT files -> merge-diverged converges', () => {
      let output: string;
      let exitCode: number;
      let trailerBefore: string | undefined;
      before(() => {
        trailerBefore = laneHeadTrailer(LANE);
        // lane side moves comp1 ...
        laneSideEdit(devPath, 'comp1/index.js', comp1Src('lane-snap-2'), 'lane snap 2');
        // ... and the branch independently moves comp2.
        branchSideCommit(
          LANE,
          defaultBranch,
          'comp2/index.js',
          comp2Src('branch-dev-2'),
          'feat: dev edits comp2 again on the branch'
        );
        ({ output, exitCode } = runBit(`bit ci sync ${LANE}`));
        gitFetch();
      });

      it('should succeed and report the merge-diverged action', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        expect(output).to.include(`${LANE} -> merge-diverged`);
      });

      it('should merge the lane into the branch before snapping, with no conflicts', () => {
        expect(output).to.include('Merging lane');
        expect(output).to.include('with no conflicts');
      });

      it("should leave BOTH sides' changes in the branch's tree", () => {
        expect(fileOnBranch(LANE, 'comp1/index.js')).to.include('lane-snap-2');
        expect(fileOnBranch(LANE, 'comp2/index.js')).to.include('branch-dev-2');
      });

      // A snap-before-merge would silently revert the lane-side edit on the lane tip.
      it('should keep the lane-side edit alive on the LANE tip (merge before snap)', () => {
        const laneComp1 = laneTipFile(devPath, 'comp1/index.js');
        expect(laneComp1, `comp1/index.js at the lane tip:\n${laneComp1}`).to.include('lane-snap-2');
        expect(laneComp1).to.not.include('lane-snap-1;');
        expect(laneTipFile(devPath, 'comp2/index.js')).to.include('branch-dev-2');
      });

      it('should record a fresh Bit-Lane-Head trailer commit on the branch', () => {
        expect(branchTipMessage(LANE)).to.include('[bit-sync]');
        expect(laneHeadTrailer(LANE)).to.not.equal(trailerBefore);
      });

      describe('re-running right after merge-diverged', () => {
        let rerun: { output: string; exitCode: number };
        let shaBefore: string;
        before(() => {
          shaBefore = branchTipSha(LANE);
          rerun = runBit(`bit ci sync ${LANE}`);
          gitFetch();
        });
        it('should be a converged no-op', () => {
          expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
          expect(rerun.output).to.include(`${LANE} -> noop (converged)`);
          expect(branchTipSha(LANE)).to.equal(shaBefore);
        });
      });
    });

    describe('scenario D2: both sides edited the SAME line -> halt, nothing written', () => {
      let output: string;
      let exitCode: number;
      let devCommitSha: string;
      let laneBefore: string;
      before(() => {
        laneSideEdit(devPath, 'comp1/index.js', comp1Src('lane-conflict'), 'lane conflicting snap');
        devCommitSha = branchSideCommit(
          LANE,
          defaultBranch,
          'comp1/index.js',
          comp1Src('branch-conflict'),
          'feat: dev edits the same comp1 line on the branch'
        );
        laneBefore = remoteLaneFingerprint(LANE);
        ({ output, exitCode } = runBit(`bit ci sync ${LANE}`));
        gitFetch();
      });

      it('should exit non-zero', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.not.equal(0);
      });

      it('should name the conflicted component and hand the lane back to a human', () => {
        expect(output).to.include('Cannot sync lane');
        expect(output).to.include('merge conflicts in');
        expect(output).to.include('comp1');
        expect(output).to.include('bit ci sync could not reconcile 1 target(s)');
        expect(output).to.include('HALTED');
      });

      it('should report skipping the bit-sync-conflict label because there is no git host', () => {
        expect(output).to.include(`skipping conflict label/comment for ${LANE}`);
      });

      it('should leave the branch tip at the dev commit — no marker commit pushed', () => {
        expect(branchTipSha(LANE)).to.equal(devCommitSha);
        expect(branchTipMessage(LANE)).to.not.include('[bit-sync]');
      });

      it('should leave the lane untouched', () => {
        expect(remoteLaneFingerprint(LANE)).to.equal(laneBefore);
      });

      it("should leave the branch's conflicted file exactly as the developer pushed it", () => {
        const onBranch = fileOnBranch(LANE, 'comp1/index.js');
        expect(onBranch).to.include('branch-conflict');
        expect(onBranch).to.not.include('<<<<<<<');
      });

      it('should still restore the workspace to the default branch and main', () => {
        expect(helper.command.runCmd('git branch --show-current').trim()).to.equal(defaultBranch);
        expect(helper.command.listLanesParsed().currentLane).to.equal('main');
      });
    });

    // D2 left the tip at a dev commit whose content exists in NO other ref: own-live with dev
    // commits, so the branch must be kept. Genuine-deletion coverage lives in the later blocks.
    describe('lane removed from the remote while the branch holds unexported work -> close-pr keeps the branch', () => {
      let output: string;
      let exitCode: number;
      let tipBefore: string;
      before(() => {
        tipBefore = branchTipSha(LANE);
        // --force: the lane carries snaps never merged into main; without it the remove refuses.
        helper.command.removeRemoteLane(LANE, '--force');
        ({ output, exitCode } = runBit(`bit ci sync ${LANE}`));
        gitFetch();
      });

      it('should succeed and report the close-pr action', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        expect(output).to.include(`${LANE} -> close-pr`);
      });

      it('should announce that the PR close is skipped without a git host', () => {
        expect(output).to.include(`skipping PR close for ${LANE}`);
      });

      it('should keep the branch, and say why', () => {
        expect(output).to.include('lane removed remotely but branch carries unmerged commits; keeping branch');
        expect(output).to.include(`branch ${LANE} kept`);
      });

      it("should leave the branch and the developer's unexported commit exactly in place", () => {
        expect(remoteBranchExists(LANE), `origin/${LANE} must survive — its commits exist nowhere else`).to.be.true;
        expect(branchTipSha(LANE)).to.equal(tipBefore);
        expect(fileOnBranch(LANE, 'comp1/index.js')).to.include('branch-conflict');
      });

      describe('re-running while the lane is still gone and the branch still kept', () => {
        let rerun: { output: string; exitCode: number };
        before(() => {
          rerun = runBit(`bit ci sync ${LANE}`);
          gitFetch();
        });
        it('should re-report close-pr, keep the branch again, and write nothing', () => {
          expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
          expect(rerun.output).to.include(`branch ${LANE} kept`);
          expect(remoteBranchExists(LANE)).to.be.true;
          expect(branchTipSha(LANE)).to.equal(tipBefore);
        });
      });
    });
  });

  // F must observe pristine remote refs WHILE drift exists — exactly the state E needs before it
  // runs — so F runs first and E right after it.
  describe('main-scope sync and --dry-run (scenarios E, F)', () => {
    const LANE = 'dry-lane';
    const SYNC_BRANCH = 'bit-sync/main';
    let defaultBranch: string;
    let devLanePath: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      setSyncConfig({ lanes: ['*'] });
      defaultBranch = setupComponentsAndInitialCommit();

      // one clone drives a lane (so `--all` has a lane target to plan), a second moves the main scope
      devLanePath = helper.scopeHelper.cloneWorkspace();
      const devMainPath = helper.scopeHelper.cloneWorkspace();

      helper.command.runCmd(`bit lane create ${LANE}`, devLanePath);
      fs.outputFileSync(path.join(devLanePath, 'comp2', 'index.js'), comp2Src('dry-lane-snap'));
      helper.command.runCmd('bit snap --message "dry lane snap"', devLanePath);
      helper.command.runCmd('bit export', devLanePath);

      // The main scope moves ahead of the repository: comp1 and comp2 are tagged 0.0.2 and exported,
      // but nothing is committed to git. That is the drift `bit ci sync --main` proposes as a PR.
      fs.outputFileSync(path.join(devMainPath, 'comp1', 'index.js'), comp1Src('main-scope-v2'));
      fs.outputFileSync(path.join(devMainPath, 'comp2', 'index.js'), comp2Src('main-scope-v2'));
      helper.command.runCmd('bit tag --message "bump both components on main"', devMainPath);
      helper.command.runCmd('bit export', devMainPath);

      // AND unexported source drift on the default branch: comp1 is modified relative to `.bitmap`
      // AND its head moved in the scope — the state that forces a real three-way merge.
      helper.fs.outputFile('comp1/index.js', comp1Src('unexported-git-drift'));
      helper.command.runCmd('git add -A');
      helper.command.runCmd('git commit -m "chore: source drift that was never exported"');
      helper.command.runCmd(`git push origin ${defaultBranch}`);
      gitFetch();
    });

    describe('scenario F: --all --dry-run writes nothing to the git remote', () => {
      let output: string;
      let exitCode: number;
      let refsBefore: string;
      before(() => {
        refsBefore = remoteRefs();
        ({ output, exitCode } = runBit('bit ci sync --all --dry-run'));
      });

      it('should succeed and report a planned action per target', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        expect(output).to.include('Dry-run');
        expect(output).to.include(`${LANE} -> import-lane`);
        expect(output).to.include('would open sync PR');
      });

      it('should have detected the drift it would act on (so the no-write claim is not vacuous)', () => {
        expect(output).to.include('main -> drift in');
      });

      it('should leave every ref on the git remote untouched', () => {
        expect(remoteRefs()).to.equal(refsBefore);
      });

      it('should not create the lane branch or the main sync branch on the remote', () => {
        expect(remoteBranchExists(LANE)).to.be.false;
        expect(remoteBranchExists(SYNC_BRANCH)).to.be.false;
      });
    });

    describe('scenario E: --main pushes the drift onto the sync branch', () => {
      let output: string;
      let exitCode: number;
      before(() => {
        ({ output, exitCode } = runBit('bit ci sync --main'));
        gitFetch();
      });

      it('should NOT halt despite unexported source drift on the default branch', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        expect(output).to.not.include('HALTED');
        expect(output).to.not.include('auto-merge-resolve');
      });

      it('should report pushing a sync commit to the main sync branch', () => {
        expect(output).to.include(`main -> pushed sync commit to ${SYNC_BRANCH}`);
      });

      it('should run PR-less and say so', () => {
        expect(output).to.include(NO_GIT_HOST_WARNING);
        expect(output).to.include('pushed sync branch, skipping PR operations');
      });

      it(`should create ${SYNC_BRANCH} on the git remote with a [bit-sync] commit`, () => {
        expect(remoteBranchExists(SYNC_BRANCH)).to.be.true;
        const message = branchTipMessage(SYNC_BRANCH);
        expect(message).to.include('[bit-sync]');
        expect(message).to.include('chore(bit-sync): sync git to latest main scope versions');
      });

      it("should carry the scope's updated component file", () => {
        expect(fileOnBranch(SYNC_BRANCH, 'comp2/index.js')).to.include('main-scope-v2');
      });

      it('should resolve the conflicted file in favour of the SCOPE, not the git drift', () => {
        const onBranch = fileOnBranch(SYNC_BRANCH, 'comp1/index.js');
        expect(onBranch, `comp1/index.js on origin/${SYNC_BRANCH}:\n${onBranch}`).to.include('main-scope-v2');
        expect(onBranch).to.not.include('unexported-git-drift');
        // non-vacuous: the default branch still holds the drift.
        expect(fileOnBranch(defaultBranch, 'comp1/index.js')).to.include('unexported-git-drift');
      });

      it('should never write to the default branch itself', () => {
        expect(fileOnBranch(defaultBranch, 'comp2/index.js')).to.include('comp2: initial');
      });

      it('should leave the workspace restored to the default branch', () => {
        expect(helper.command.runCmd('git branch --show-current').trim()).to.equal(defaultBranch);
      });

      describe('re-running --main once the drift has been pushed', () => {
        let rerun: { output: string; exitCode: number };
        let shaBefore: string;
        before(() => {
          shaBefore = branchTipSha(SYNC_BRANCH);
          rerun = runBit('bit ci sync --main');
          gitFetch();
        });
        it('should report convergence and not move the sync branch', () => {
          expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
          expect(rerun.output).to.include('main -> converged');
          expect(branchTipSha(SYNC_BRANCH)).to.equal(shaBefore);
        });
      });
    });

    describe('--all reconciles the lane and the main scope in one run', () => {
      let output: string;
      let exitCode: number;
      before(() => {
        ({ output, exitCode } = runBit('bit ci sync --all'));
        gitFetch();
      });

      it('should succeed and report both targets', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        expect(output).to.include(`${LANE} -> import-lane`);
        expect(output).to.include('main ->');
      });

      it('should have created the lane branch with the lane content', () => {
        expect(remoteBranchExists(LANE)).to.be.true;
        expect(fileOnBranch(LANE, 'comp2/index.js')).to.include('dry-lane-snap');
        expect(branchTipMessage(LANE)).to.include('Bit-Lane-Head:');
      });

      it('should refuse --all combined with a narrower target', () => {
        const res = runBit('bit ci sync --all --main');
        expect(res.exitCode).to.not.equal(0);
        expect(res.output).to.include('--all cannot be combined with');
      });
    });
  });

  // The load-bearing half is the negative: `bit-sync/main` is never created or touched, checked both
  // on the run that pushes and on the converged rerun.
  describe('main-scope direct push (mainSync: direct-push)', () => {
    const SYNC_BRANCH = 'bit-sync/main';
    let defaultBranch: string;
    let output: string;
    let exitCode: number;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      setSyncConfig({ lanes: ['*'], mainSync: 'direct-push' });
      defaultBranch = setupComponentsAndInitialCommit();

      // The same drift recipe as scenario E.
      const devMainPath = helper.scopeHelper.cloneWorkspace();
      fs.outputFileSync(path.join(devMainPath, 'comp1', 'index.js'), comp1Src('direct-push-v2'));
      helper.command.runCmd('bit tag --message "bump comp1 on main"', devMainPath);
      helper.command.runCmd('bit export', devMainPath);

      ({ output, exitCode } = runBit('bit ci sync --main'));
      gitFetch();
    });

    it('should succeed and report the direct push with the pushed tip', () => {
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      const summary = output.match(/main -> direct-push \(pushed (\S+) @ ([0-9a-f]{7,40})\)/);
      expect(summary, `expected a direct-push summary in:\n${output}`).to.not.be.null;
      expect(summary![1]).to.equal(defaultBranch);
      // the sha in the summary is the tip that was actually pushed
      expect(branchTipSha(defaultBranch).startsWith(summary![2])).to.be.true;
    });

    it('should tip the DEFAULT branch with a sync-authored commit carrying the drift', () => {
      const message = branchTipMessage(defaultBranch);
      expect(message).to.include('[bit-sync]');
      expect(message).to.include('chore(bit-sync): sync git to latest main scope versions');
      expect(fileOnBranch(defaultBranch, 'comp1/index.js')).to.include('direct-push-v2');
    });

    it(`should never create ${SYNC_BRANCH} on the remote, nor mention PR operations`, () => {
      expect(remoteBranchExists(SYNC_BRANCH)).to.be.false;
      expect(output).to.not.include('skipping PR operations');
      expect(output).to.not.include('sync PR');
    });

    it('should leave the workspace restored: git on the default branch, bit on main', () => {
      expect(helper.command.runCmd('git branch --show-current').trim()).to.equal(defaultBranch);
      expect(helper.command.listLanesParsed().currentLane).to.equal('main');
    });

    describe('re-running once the drift has been pushed', () => {
      let rerun: { output: string; exitCode: number };
      let shaBefore: string;
      before(() => {
        shaBefore = branchTipSha(defaultBranch);
        rerun = runBit('bit ci sync --main');
        gitFetch();
      });

      it('should report convergence and not move the default branch', () => {
        expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
        expect(rerun.output).to.include('main -> converged');
        expect(branchTipSha(defaultBranch)).to.equal(shaBefore);
      });

      it(`should still not have created ${SYNC_BRANCH}`, () => {
        expect(remoteBranchExists(SYNC_BRANCH)).to.be.false;
      });
    });
  });

  // Properties that live only at the loop level: a deleted lane is still visited (via the branch half
  // of the enumeration), one halted lane must not abort the rest, lanes must not contaminate each
  // other (comp3 exists on lane A only), and an ordinary branch must survive the run.
  describe('--all across two lanes (deleted-lane cleanup, halt isolation, cross-lane isolation)', () => {
    const LANE_A = 'sync-a';
    const LANE_B = 'sync-b';
    /** an ordinary developer branch: no lane, no sync history, unmerged work on it */
    const PLAIN_BRANCH = 'feature-x';
    /** a component that exists on lane A only — the tracer for cross-lane contamination */
    const comp3Src = (marker: string) => `module.exports = () => 'comp3: ${marker}';\n`;
    let defaultBranch: string;
    let devA: string;
    let devB: string;
    let plainBranchSha: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      setSyncConfig({ lanes: ['*'] });
      defaultBranch = setupComponentsAndInitialCommit();

      // Pushed before anything else so it is present for every run below.
      helper.command.runCmd(`git checkout -b ${PLAIN_BRANCH}`);
      helper.fs.outputFile('docs/notes.md', 'unmerged developer work that must not be destroyed\n');
      helper.command.runCmd('git add -A');
      helper.command.runCmd('git commit -m "docs: unmerged developer work"');
      helper.command.runCmd(`git push origin ${PLAIN_BRANCH}`);
      plainBranchSha = helper.command.runCmd('git rev-parse HEAD').trim();
      helper.command.runCmd(`git checkout -f ${defaultBranch}`);

      // lane A: an edit to comp1, plus comp3 which exists nowhere else (not on main, not on lane B).
      devA = helper.scopeHelper.cloneWorkspace();
      helper.command.runCmd(`bit lane create ${LANE_A}`, devA);
      fs.outputFileSync(path.join(devA, 'comp1', 'index.js'), comp1Src('lane-a-snap-1'));
      fs.outputFileSync(path.join(devA, 'comp3', 'index.js'), comp3Src('lane-a-only'));
      helper.command.addComponent('comp3', {}, devA);
      helper.command.runCmd('bit snap --message "lane a snap 1"', devA);
      helper.command.runCmd('bit export', devA);

      // lane B moves a different component, so any content crossing between them is contamination.
      devB = helper.scopeHelper.cloneWorkspace();
      helper.command.runCmd(`bit lane create ${LANE_B}`, devB);
      fs.outputFileSync(path.join(devB, 'comp2', 'index.js'), comp2Src('lane-b-snap-1'));
      helper.command.runCmd('bit snap --message "lane b snap 1"', devB);
      helper.command.runCmd('bit export', devB);
    });

    describe('first --all run: both lanes are imported onto their own branches', () => {
      let output: string;
      let exitCode: number;
      before(() => {
        ({ output, exitCode } = runBit('bit ci sync --all'));
        gitFetch();
      });

      it('should succeed and import both lanes in one run', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        expect(output).to.include(`${LANE_A} -> import-lane`);
        expect(output).to.include(`${LANE_B} -> import-lane`);
      });

      it("should put each lane's own content on its own branch", () => {
        expect(fileOnBranch(LANE_A, 'comp1/index.js')).to.include('lane-a-snap-1');
        expect(fileOnBranch(LANE_B, 'comp2/index.js')).to.include('lane-b-snap-1');
      });

      // `feature-x` reaches the planner with the same input as a deleted lane's branch; only the
      // absence of a lane pointer in its committed `.bitmap` makes it a no-op.
      it('should visit an ordinary developer branch and leave it completely alone', () => {
        expect(output, `bit ci sync output:\n${output}`).to.include(
          `${PLAIN_BRANCH} -> noop (branch maps to no lane and has no sync history`
        );
        expect(remoteBranchExists(PLAIN_BRANCH), `origin/${PLAIN_BRANCH} must still exist`).to.be.true;
        expect(branchTipSha(PLAIN_BRANCH)).to.equal(plainBranchSha);
        expect(fileOnBranch(PLAIN_BRANCH, 'docs/notes.md')).to.include('must not be destroyed');
      });

      it("should materialize lane A's exclusive component onto lane A's branch, and only there", () => {
        // Lane A runs first; without the restore cleaning up, lane B's `add -A` would commit comp3.
        const onA = branchPathsMatching(LANE_A, 'comp3');
        expect(onA, `paths mentioning comp3 on origin/${LANE_A}`).to.not.have.lengthOf(0);
        expect(fileOnBranch(LANE_A, onA.find((p) => p.endsWith('index.js')) as string)).to.include('lane-a-only');
        expect(branchPathsMatching(LANE_B, 'comp3'), `comp3 must not exist on origin/${LANE_B}`).to.have.lengthOf(0);
      });

      it('should leave the workspace restored after the whole run', () => {
        expect(helper.command.runCmd('git branch --show-current').trim()).to.equal(defaultBranch);
        expect(helper.command.listLanesParsed().currentLane).to.equal('main');
      });
    });

    describe('a conflicting lane halts, and the lane after it still syncs', () => {
      let output: string;
      let exitCode: number;
      let devCommitShaA: string;
      before(() => {
        // lane A diverges irreconcilably: both sides edit the same comp1 line.
        laneSideEdit(devA, 'comp1/index.js', comp1Src('lane-a-conflict'), 'lane a conflicting snap');
        devCommitShaA = branchSideCommit(
          LANE_A,
          defaultBranch,
          'comp1/index.js',
          comp1Src('branch-a-conflict'),
          'feat: dev edits the same comp1 line on lane A branch'
        );
        // lane B, meanwhile, has ordinary work to mirror.
        laneSideEdit(devB, 'comp2/index.js', comp2Src('lane-b-snap-2'), 'lane b snap 2');
        ({ output, exitCode } = runBit('bit ci sync --all'));
        gitFetch();
      });

      it('should halt lane A and exit non-zero', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.not.equal(0);
        expect(output).to.include('HALTED');
        expect(output).to.include('merge conflicts in');
        expect(output).to.include('bit ci sync could not reconcile 1 target(s)');
      });

      it('should leave lane A entirely untouched: branch tip still the dev commit', () => {
        expect(branchTipSha(LANE_A)).to.equal(devCommitShaA);
        expect(branchTipMessage(LANE_A)).to.not.include('[bit-sync]');
      });

      it('should STILL reconcile lane B — the halt is per-lane, not per-run', () => {
        expect(output).to.include(`${LANE_B} -> import-lane`);
        expect(fileOnBranch(LANE_B, 'comp2/index.js')).to.include('lane-b-snap-2');
        expect(laneHeadTrailer(LANE_B)).to.be.a('string').with.lengthOf(40);
      });

      it("should not leak the halted lane's files onto lane B's branch", () => {
        expect(branchPathsMatching(LANE_B, 'comp3')).to.have.lengthOf(0);
        expect(fileOnBranch(LANE_B, 'comp1/index.js')).to.not.include('lane-a-conflict');
      });
    });

    // Lane A no longer exists on bit.cloud, so it can only be visited through the branch half of the
    // enumeration.
    describe('a lane deleted on bit.cloud is retired by --all, and the surviving lane still syncs', () => {
      let output: string;
      let exitCode: number;
      before(() => {
        // Resolve lane A's halted divergence and converge the pair, leaving the tip a sync commit with
        // nothing above it — so the deletion below exercises close-pr's genuine delete path.
        branchSideCommit(
          LANE_A,
          defaultBranch,
          'comp1/index.js',
          comp1Src('lane-a-snap-1'),
          'revert comp1 to the last synced content'
        );
        branchSideCommit(
          LANE_A,
          defaultBranch,
          'comp2/index.js',
          comp2Src('branch-a-export'),
          'feat: dev edits comp2 on lane A branch'
        );
        const converge = runBit(`bit ci sync ${LANE_A}`);
        expect(converge.exitCode, `converge run output:\n${converge.output}`).to.equal(0);
        gitFetch();
        expect(branchTipMessage(LANE_A), 'the converge run must leave a sync commit at the tip').to.include(
          '[bit-sync]'
        );

        helper.command.removeRemoteLane(LANE_A, '--force');
        ({ output, exitCode } = runBit('bit ci sync --all'));
        gitFetch();
      });

      it('should still visit the deleted lane, taking it from its branch', () => {
        // 3 = lane A (branch only), lane B (lane), and the ordinary developer branch.
        expect(output, `bit ci sync output:\n${output}`).to.include('Reconciling 3 mapped lane(s)');
        expect(output).to.include(`${LANE_A} -> close-pr`);
      });

      it('should succeed', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      });

      it("should delete the removed lane's branch from the git remote", () => {
        expect(output).to.include(`branch ${LANE_A} deleted`);
        expect(remoteBranchExists(LANE_A)).to.be.false;
      });

      it('should announce the skipped PR close (PR-less run) rather than skipping it silently', () => {
        expect(output).to.include(`skipping PR close for ${LANE_A}`);
      });

      it('should leave the surviving lane converged and its branch intact', () => {
        expect(output).to.include(`${LANE_B} -> noop (converged)`);
        expect(remoteBranchExists(LANE_B)).to.be.true;
        expect(fileOnBranch(LANE_B, 'comp2/index.js')).to.include('lane-b-snap-2');
      });

      it('should still not have touched the ordinary developer branch', () => {
        expect(remoteBranchExists(PLAIN_BRANCH)).to.be.true;
        expect(branchTipSha(PLAIN_BRANCH)).to.equal(plainBranchSha);
      });

      describe('re-running once the deleted lane has no branch left either', () => {
        let rerun: { output: string; exitCode: number };
        before(() => {
          rerun = runBit('bit ci sync --all');
          gitFetch();
        });
        it('should drop the retired lane from the run entirely', () => {
          expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
          // 2 = lane B plus the ordinary developer branch; lane A is gone from both enumeration sources.
          expect(rerun.output).to.include('Reconciling 2 mapped lane(s)');
          expect(rerun.output).to.not.include(`${LANE_A} ->`);
          expect(rerun.output).to.include(`${LANE_B} -> noop (converged)`);
        });
      });
    });

    // Two defences proved at once: message text is not state (the decoy's forged trailer is never
    // read), and the state walk is `--first-parent` (a merged-in state-bearing commit is newer than
    // the branch's own and would otherwise outrank it).
    describe('a Bit-Lane-Head commit merged in from elsewhere must not outrank the branch’s own', () => {
      let output: string;
      let exitCode: number;
      before(() => {
        gitFetch();
        // The decoy: a sync-shaped commit off the default branch, plus a real component edit so the
        // export the reconciler plans has something to snap.
        helper.command.runCmd(`git checkout -f -B decoy-src origin/${defaultBranch}`);
        helper.fs.outputFile('comp1/index.js', comp1Src('post-merge-dev'));
        helper.command.runCmd('git add -A');
        helper.command.runCmd(
          `git commit -m "chore(bit-sync): decoy from another pair" -m "Bit-Lane-Head: ${'f'.repeat(40)}" -m "[bit-sync]"`
        );
        // --no-ff guarantees the decoy stays on the SECOND parent — where `--first-parent` refuses to
        // look and default ordering happily looks.
        helper.command.runCmd(`git checkout -f -B ${LANE_B} origin/${LANE_B}`);
        helper.command.runCmd('git merge --no-ff --no-edit decoy-src');
        helper.command.runCmd(`git push origin ${LANE_B}`);
        helper.command.runCmd(`git checkout -f ${defaultBranch}`);
        ({ output, exitCode } = runBit('bit ci sync --all'));
        gitFetch();
      });

      it("should read the branch's OWN sync commit, so the lane does not look moved", () => {
        // Only the branch moved => export-branch; reading the decoy yields merge-diverged.
        expect(output, `bit ci sync output:\n${output}`).to.include(`${LANE_B} -> export-branch`);
        expect(output).to.not.include(`${LANE_B} -> merge-diverged`);
        expect(output).to.not.include(`${LANE_B} -> import-lane`);
      });

      it('should succeed and converge, leaving the decoy trailer unused', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        expect(laneHeadTrailer(LANE_B)).to.not.equal('f'.repeat(40));
      });

      describe('re-running after the merge has been reconciled', () => {
        let rerun: { output: string; exitCode: number };
        before(() => {
          rerun = runBit('bit ci sync --all');
          gitFetch();
        });
        it('should be a converged no-op — idempotence survives the merge', () => {
          expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
          expect(rerun.output).to.include(`${LANE_B} -> noop (converged)`);
        });
      });
    });
  });

  // Walks one lane branch through all three ownership outcomes, plus the branch with inherited
  // history that must never be touched.
  describe('branch ownership decides what close-pr may delete', () => {
    const LANE = 'own-lane';
    /** an ordinary developer branch, forked from a default branch that already carries a sync trailer */
    const PLAIN_BRANCH = 'feature-x';
    let defaultBranch: string;
    let devPath: string;
    let plainBranchSha: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      setSyncConfig({ lanes: ['*'] });
      defaultBranch = setupComponentsAndInitialCommit();

      devPath = helper.scopeHelper.cloneWorkspace();
      helper.command.runCmd(`bit lane create ${LANE}`, devPath);
      fs.outputFileSync(path.join(devPath, 'comp1', 'index.js'), comp1Src('own-lane-snap'));
      helper.command.runCmd('bit snap --message "own lane snap"', devPath);
      helper.command.runCmd('bit export', devPath);

      // Give the lane a real branch with a real sync commit of its own, before anything else happens.
      const first = runBit(`bit ci sync ${LANE}`);
      expect(first.exitCode, `bit ci sync ${LANE} output:\n${first.output}`).to.equal(0);
      gitFetch();

      // Simulate what a squash/rebase/ff-merged sync PR leaves behind: a sync-shaped commit on the
      // default branch's first-parent line. Empty on purpose, so it cannot show up as main-scope drift.
      helper.command.runCmd(`git checkout -f -B ${defaultBranch} origin/${defaultBranch}`);
      helper.command.runCmd(
        `git commit --allow-empty ` +
          `-m "chore(bit-sync): sync lane ${helper.scopes.remote}/other-lane @ abc123def" ` +
          `-m "Bit-Lane-Head: ${'a'.repeat(40)}" -m "[bit-sync]"`
      );
      helper.command.runCmd(`git push origin ${defaultBranch}`);

      // The developer branch is cut from THAT tip, so it inherits the trailer.
      helper.command.runCmd(`git checkout -b ${PLAIN_BRANCH}`);
      helper.fs.outputFile('docs/plan.md', 'unmerged developer work that must not be destroyed\n');
      helper.command.runCmd('git add -A');
      helper.command.runCmd('git commit -m "docs: unmerged developer work"');
      helper.command.runCmd(`git push origin ${PLAIN_BRANCH}`);
      plainBranchSha = helper.command.runCmd('git rev-parse HEAD').trim();
      helper.command.runCmd(`git checkout -f ${defaultBranch}`);
      gitFetch();
    });

    /** put `origin/<defaultBranch>` ancestrally ahead of the lane branch without changing its content */
    function mergeLaneBranchIntoDefault() {
      gitFetch();
      helper.command.runCmd(`git checkout -f -B ${defaultBranch} origin/${defaultBranch}`);
      // `-s ours` records the merge (all the ownership check reads) while leaving the default branch's
      // tree — and `.bitmap`, which must stay on main — exactly as it was.
      helper.command.runCmd(`git merge -s ours --no-edit origin/${LANE}`);
      helper.command.runCmd(`git push origin ${defaultBranch}`);
      gitFetch();
    }

    describe('an ordinary branch that INHERITED a sync trailer from the default branch', () => {
      let output: string;
      let exitCode: number;
      before(() => {
        ({ output, exitCode } = runBit('bit ci sync --all'));
        gitFetch();
      });

      it('should be ignored, not retired', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        expect(output).to.include(`${PLAIN_BRANCH} -> noop (branch maps to no lane and has no sync history`);
      });

      it('should leave the branch and its work exactly as the developer pushed them', () => {
        expect(remoteBranchExists(PLAIN_BRANCH), `origin/${PLAIN_BRANCH} must still exist`).to.be.true;
        expect(branchTipSha(PLAIN_BRANCH)).to.equal(plainBranchSha);
        expect(fileOnBranch(PLAIN_BRANCH, 'docs/plan.md')).to.include('must not be destroyed');
      });

      it('should have been non-vacuous: the branch really does carry an inherited trailer', () => {
        const log = helper.command.runCmd(`git log origin/${PLAIN_BRANCH} --first-parent --format=%B`);
        expect(log).to.include('Bit-Lane-Head:');
        expect(log).to.include(`sync lane ${helper.scopes.remote}/other-lane`);
      });

      it('should be ignored on the STRUCTURAL evidence: its .bitmap points at no lane', () => {
        expect(fileOnBranch(PLAIN_BRANCH, '.bitmap')).to.not.include('_bit_lane');
      });

      describe('running --all a second time', () => {
        let rerun: { output: string; exitCode: number };
        before(() => {
          rerun = runBit('bit ci sync --all');
          gitFetch();
        });
        it('should still ignore it and still not delete it', () => {
          expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
          expect(rerun.output).to.include(`${PLAIN_BRANCH} -> noop`);
          expect(remoteBranchExists(PLAIN_BRANCH)).to.be.true;
          expect(branchTipSha(PLAIN_BRANCH)).to.equal(plainBranchSha);
        });
      });
    });

    describe('our own branch whose sync history is merged but whose tip is not (own-superseded)', () => {
      let output: string;
      let exitCode: number;
      let tipBefore: string;
      before(() => {
        // 1. the sync commit lands in the default branch (the PR was merged) ...
        mergeLaneBranchIntoDefault();
        // 2. ... and then work continues on the branch, so the tip is ahead of the default branch again.
        branchSideCommit(LANE, defaultBranch, 'comp2/index.js', comp2Src('after-the-merge'), 'feat: more work');
        gitFetch();
        tipBefore = branchTipSha(LANE);
        // 3. the lane is retired on bit.cloud.
        helper.command.removeRemoteLane(LANE, '--force');
        ({ output, exitCode } = runBit('bit ci sync --all'));
        gitFetch();
      });

      it('should close the PR but keep the branch, and say so', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        expect(output).to.include('lane removed remotely but branch carries unmerged commits; keeping branch');
        expect(output).to.include(`branch ${LANE} kept`);
      });

      it('should not have deleted the branch or moved it', () => {
        expect(remoteBranchExists(LANE), `origin/${LANE} must survive — its commits exist nowhere else`).to.be.true;
        expect(branchTipSha(LANE)).to.equal(tipBefore);
        expect(fileOnBranch(LANE, 'comp2/index.js')).to.include('after-the-merge');
      });
    });

    describe('our own branch that is fully merged into the default branch (own-merged)', () => {
      let output: string;
      let exitCode: number;
      before(() => {
        mergeLaneBranchIntoDefault();
        ({ output, exitCode } = runBit('bit ci sync --all'));
        gitFetch();
      });

      it('should close the PR and delete the branch', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        expect(output).to.include(`${LANE} -> close-pr`);
        expect(output).to.include(`branch ${LANE} deleted`);
        expect(remoteBranchExists(LANE)).to.be.false;
      });

      it('should still not have touched the ordinary developer branch', () => {
        expect(remoteBranchExists(PLAIN_BRANCH)).to.be.true;
        expect(branchTipSha(PLAIN_BRANCH)).to.equal(plainBranchSha);
      });
    });
  });

  // The cross-scope split: foreign CONTENT is refused outright; a foreign HOST is fine as long as the
  // content is this repo's, addressed by its scope-qualified id.
  describe('a lane whose components span two scopes is refused, never half-mirrored', () => {
    const LANE = 'cross-scope';
    let otherScope: string;
    let devPath: string;
    let refsBeforeSync: string;
    let defaultBranch: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      // A second remote scope, mutually reachable, so one lane can carry components of both.
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope('-other-scope');
      otherScope = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);
      setupGitRemote();
      setSyncConfig({ lanes: ['*'] });

      // comp1 belongs to this repository's scope; comp2 to the other one (variant set before `bit add`).
      helper.fs.outputFile('comp1/index.js', comp1Src('initial'));
      helper.fs.outputFile('comp2/index.js', comp2Src('initial'));
      helper.workspaceJsonc.addToVariant('comp2', 'defaultScope', otherScope);
      helper.command.addComponent('comp1');
      helper.command.addComponent('comp2');
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.fs.outputFile('.gitignore', 'node_modules/\n.bit/\n');
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "initial commit"');
      defaultBranch = helper.command.runCmd('git branch --show-current').trim();
      helper.command.runCmd(`git push -u origin ${defaultBranch}`);

      // The "developer on bit.cloud" moves BOTH components on one lane hosted by this scope.
      devPath = helper.scopeHelper.cloneWorkspace();
      helper.command.runCmd(`bit lane create ${LANE}`, devPath);
      fs.outputFileSync(path.join(devPath, 'comp1', 'index.js'), comp1Src('cross-scope-snap'));
      fs.outputFileSync(path.join(devPath, 'comp2', 'index.js'), comp2Src('cross-scope-snap'));
      helper.command.runCmd('bit snap --message "cross-scope lane snap"', devPath);
      helper.command.runCmd('bit export', devPath);
    });

    it('should have produced a genuinely cross-scope lane (setup sanity)', () => {
      const parsed = helper.command.listRemoteLanesParsed();
      const lane = parsed.lanes.find((l: any) => (l.id?.name ?? l.name) === LANE);
      const ids = (lane?.components ?? []).map((c: any) => (typeof c.id === 'string' ? c.id : c.id.toString()));
      expect(ids.join(' ')).to.include(`${otherScope}/comp2`);
      expect(ids.join(' ')).to.include(`${helper.scopes.remote}/comp1`);
    });

    describe('targeted explicitly', () => {
      let output: string;
      let exitCode: number;
      before(() => {
        refsBeforeSync = remoteRefs();
        ({ output, exitCode } = runBit(`bit ci sync ${LANE}`));
        gitFetch();
      });

      it('should refuse and exit non-zero, naming the foreign scope and components', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.not.equal(0);
        expect(output).to.include('cross-scope lane: components from scope(s)');
        expect(output).to.include(otherScope);
        expect(output).to.include(`this repo maps scope ${helper.scopes.remote}`);
        expect(output).to.include(`${otherScope}/comp2`);
        expect(output).to.include("see the docs' Cross-scope lanes section");
        expect(output).to.include('No branch was created and nothing was written');
      });

      it('should not report it as a halt: no bit-sync-conflict machinery is involved', () => {
        expect(output).to.not.include('HALTED');
        expect(output).to.not.include('bit-sync-conflict');
      });

      it('should refuse BEFORE planning, so no action was ever chosen', () => {
        // This shape would otherwise plan `import-lane`.
        expect(output).to.not.include('import-lane');
      });

      it('should write nothing to the git remote', () => {
        expect(remoteBranchExists(LANE)).to.be.false;
        expect(remoteRefs()).to.equal(refsBeforeSync);
      });
    });

    describe('reached by an --all run', () => {
      let output: string;
      let exitCode: number;
      before(() => {
        ({ output, exitCode } = runBit('bit ci sync --all'));
        gitFetch();
      });

      it('should SKIP it and keep the run green', () => {
        expect(exitCode, `bit ci sync --all output:\n${output}`).to.equal(0);
        expect(output).to.include(`${LANE} -> skipped (cross-scope lane:`);
        expect(output).to.include('no branch created');
        expect(output).to.not.include('HALTED');
        expect(remoteBranchExists(LANE)).to.be.false;
      });

      it('should still reconcile the rest of the run (the main scope)', () => {
        expect(output).to.include('main ->');
      });
    });

    describe('a lane that became cross-scope AFTER its branch existed', () => {
      const MID_FLIGHT_LANE = 'mid-flight';
      let output: string;
      let exitCode: number;
      let shaBefore: string;

      before(() => {
        // Step off the cross-scope lane first — a lane forked from another lane inherits its
        // components — and restore both files so only the edit below counts as modified.
        helper.command.runCmd('bit switch main', devPath);
        fs.outputFileSync(path.join(devPath, 'comp1', 'index.js'), comp1Src('initial'));
        fs.outputFileSync(path.join(devPath, 'comp2', 'index.js'), comp2Src('initial'));
        helper.command.runCmd(`bit lane create ${MID_FLIGHT_LANE}`, devPath);
        fs.outputFileSync(path.join(devPath, 'comp1', 'index.js'), comp1Src('mid-flight-single-scope'));
        helper.command.runCmd(`bit snap --message "single-scope snap"`, devPath);
        helper.command.runCmd('bit export', devPath);
        const first = runBit(`bit ci sync ${MID_FLIGHT_LANE}`);
        expect(first.exitCode, `first sync output:\n${first.output}`).to.equal(0);
        gitFetch();
        shaBefore = branchTipSha(MID_FLIGHT_LANE);

        // Phase 2: the lane grows a component from the OTHER scope.
        fs.outputFileSync(path.join(devPath, 'comp2', 'index.js'), comp2Src('mid-flight-foreign'));
        helper.command.runCmd(`bit snap --message "foreign-scope snap"`, devPath);
        helper.command.runCmd('bit export', devPath);

        ({ output, exitCode } = runBit(`bit ci sync ${MID_FLIGHT_LANE}`));
        gitFetch();
      });

      it('should HALT, naming the branch it can no longer converge with', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.not.equal(0);
        expect(output).to.include(`HALTED ${MID_FLIGHT_LANE} -> lane became cross-scope after it was mirrored onto`);
        expect(output).to.include('can no longer be reconciled automatically');
      });

      it('should leave the branch exactly where the last good sync left it', () => {
        expect(remoteBranchExists(MID_FLIGHT_LANE)).to.be.true;
        expect(branchTipSha(MID_FLIGHT_LANE)).to.equal(shaBefore);
      });

      // A single --all must report both cross-scope outcomes without either swallowing the other.
      describe('the same pair met by an --all run', () => {
        let allOutput: string;
        let allExit: number;
        before(() => {
          ({ output: allOutput, exitCode: allExit } = runBit('bit ci sync --all'));
          gitFetch();
        });

        it('should halt the mid-flight lane and skip the never-mirrored one, in the same run', () => {
          expect(allExit, `bit ci sync --all output:\n${allOutput}`).to.not.equal(0);
          expect(allOutput).to.include(`HALTED ${MID_FLIGHT_LANE} -> lane became cross-scope`);
          expect(allOutput).to.include(`${LANE} -> skipped (cross-scope lane:`);
          expect(branchTipSha(MID_FLIGHT_LANE)).to.equal(shaBefore);
        });
      });
    });

    // `--all` reaches the per-lane reconciler without the command layer's name checks, so the
    // reserved-branch guard has to live in the reconciler itself; this proves it does.
    describe('a lane whose configured branch is the default branch', () => {
      let output: string;
      let exitCode: number;
      let defaultBranchShaBefore: string;

      before(() => {
        gitFetch();
        defaultBranchShaBefore = branchTipSha(defaultBranch);
        setSyncConfig({ lanes: ['*'], branches: { [LANE]: defaultBranch } });
        ({ output, exitCode } = runBit('bit ci sync --all'));
        gitFetch();
      });

      after(() => {
        setSyncConfig({ lanes: ['*'] });
      });

      it('should skip the lane instead of planning anything for the default branch', () => {
        expect(output).to.include(`${LANE} -> skipped`);
        expect(output).to.include(`maps to ${defaultBranch}`);
        expect(output).to.include('the main scope is reconciled by "bit ci sync --main"');
      });

      it('should refuse before even reading the lane, so the cross-scope check never gets a say', () => {
        expect(output).to.not.include(`${LANE} -> skipped (cross-scope lane:`);
      });

      it('should not have written to the default branch', () => {
        expect(branchTipSha(defaultBranch)).to.equal(defaultBranchShaBefore);
        expect(exitCode, `bit ci sync --all output:\n${output}`).to.not.equal(0); // the mid-flight lane still halts
      });
    });
  });

  describe('a lane hosted on another scope, with content in this repo scope, syncs when targeted by its id', () => {
    const LANE = 'hosted-elsewhere';
    let hostScope: string;
    let defaultBranch: string;
    let devPath: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope('-lane-host');
      hostScope = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);
      setupGitRemote();
      setSyncConfig({ lanes: ['*'] });
      defaultBranch = setupComponentsAndInitialCommit();

      // `--scope` puts the lane OBJECT on another scope; the components on it are still this
      // workspace's, so the lane's content is entirely this repository's business.
      devPath = helper.scopeHelper.cloneWorkspace();
      helper.command.runCmd(`bit lane create ${LANE} --scope ${hostScope}`, devPath);
      fs.outputFileSync(path.join(devPath, 'comp1', 'index.js'), comp1Src('hosted-elsewhere-snap'));
      helper.command.runCmd('bit snap --message "snap on a foreign-hosted lane"', devPath);
      helper.command.runCmd('bit export', devPath);
    });

    describe('targeted by its scope-qualified id', () => {
      let output: string;
      let exitCode: number;
      before(() => {
        ({ output, exitCode } = runBit(`bit ci sync ${hostScope}/${LANE}`));
        gitFetch();
      });

      it('should sync it normally', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        expect(output).to.include(`${LANE} -> import-lane`);
      });

      it('should mirror onto the branch its NAME maps to, not one named after the hosting scope', () => {
        expect(remoteBranchExists(LANE)).to.be.true;
        expect(remoteBranchExists(`${hostScope}/${LANE}`)).to.be.false;
      });

      it("should record the lane's REAL, scope-qualified id in the branch's .bitmap", () => {
        // A pointer at `<defaultScope>/<name>` would name a lane that does not exist.
        const bitmap = fileOnBranch(LANE, '.bitmap');
        expect(bitmap).to.include('_bit_lane');
        expect(bitmap).to.include(hostScope);
      });

      it("should annotate the sync commit with the lane's REAL id, for the human audit trail", () => {
        const message = branchTipMessage(LANE);
        expect(message).to.include(`sync lane ${hostScope}/${LANE}`);
        expect(message).to.include('[bit-sync]');
        expect(laneHeadTrailer(LANE)).to.be.a('string').with.lengthOf(40);
      });

      it("should put the lane's file content on the branch", () => {
        const onBranch = fileOnBranch(LANE, 'comp1/index.js');
        expect(onBranch, `comp1/index.js on origin/${LANE}:\n${onBranch}`).to.include('hosted-elsewhere-snap');
        expect(fileOnBranch(defaultBranch, 'comp1/index.js')).to.include('comp1: initial');
      });
    });

    describe('re-run with the same scope-qualified id', () => {
      let output: string;
      let exitCode: number;
      let shaBefore: string;
      before(() => {
        shaBefore = branchTipSha(LANE);
        ({ output, exitCode } = runBit(`bit ci sync ${hostScope}/${LANE}`));
        gitFetch();
      });

      it('should read as converged — the real lane id round-trips through the commit subject', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        expect(output).to.include(`${LANE} -> noop (converged)`);
        expect(branchTipSha(LANE)).to.equal(shaBefore);
      });
    });

    describe('the same branch reached by NAME (the Stage-0 asymmetry)', () => {
      let output: string;
      let exitCode: number;
      let shaBefore: string;
      before(() => {
        shaBefore = branchTipSha(LANE);
        ({ output, exitCode } = runBit(`bit ci sync --branch ${LANE}`));
        gitFetch();
      });

      // A branch name carries no scope, so this resolves against `defaultScope`, mismatches the
      // pointer, and reads `inherited-or-none` — the safe direction of the Stage-0 trade.
      it('should leave the branch alone rather than retire it', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        expect(output).to.include(`${LANE} -> noop`);
        expect(output).to.not.include('close-pr');
        expect(remoteBranchExists(LANE)).to.be.true;
        expect(branchTipSha(LANE)).to.equal(shaBefore);
      });
    });

    describe('a same-named lane in THIS scope must not hijack the foreign-hosted lane’s branch', () => {
      let output: string;
      let exitCode: number;
      let dryRunOutput: string;
      let dryRunExit: number;
      let shaBefore: string;
      let refsBeforeDryRun: string;
      let rivalDevPath: string;

      before(() => {
        shaBefore = branchTipSha(LANE);
        rivalDevPath = helper.scopeHelper.cloneWorkspace();
        // Same lane NAME, this repository's own scope; `--alias` because the workspace already tracks
        // the foreign-hosted lane under that name locally.
        helper.command.runCmd(`bit lane create ${LANE} --alias rival`, rivalDevPath);
        fs.outputFileSync(path.join(rivalDevPath, 'comp2', 'index.js'), comp2Src('rival-lane-snap'));
        helper.command.runCmd('bit snap --message "rival lane snap"', rivalDevPath);
        helper.command.runCmd('bit export', rivalDevPath);

        // The dry run goes FIRST: run after the real halt, the label would already be there and the
        // no-write claim would prove nothing.
        refsBeforeDryRun = remoteRefs();
        ({ output: dryRunOutput, exitCode: dryRunExit } = runBit(`bit ci sync ${LANE} --dry-run`));
        gitFetch();

        // Bare name => this workspace's defaultScope, i.e. the rival lane.
        ({ output, exitCode } = runBit(`bit ci sync ${LANE}`));
        gitFetch();
      });

      it('should report the halt under --dry-run without annotating the owner’s PR', () => {
        expect(dryRunExit, `bit ci sync --dry-run output:\n${dryRunOutput}`).to.not.equal(0);
        expect(dryRunOutput).to.include(`HALTED ${LANE} -> branch ${LANE} mirrors lane ${hostScope}/${LANE}`);
        // Proof the PR-writing branch was skipped rather than merely having had no PR to write to.
        expect(dryRunOutput).to.include('Dry-run: the PR is not labelled or commented on');
      });

      it('should leave the git remote byte-identical after the dry run', () => {
        expect(remoteRefs()).to.equal(refsBeforeDryRun);
      });

      it('should halt, naming the lane that owns the branch and the one that was refused', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.not.equal(0);
        expect(output).to.include(`HALTED ${LANE} -> branch ${LANE} mirrors lane ${hostScope}/${LANE}`);
        expect(output).to.include(`refusing to plan for ${helper.scopes.remote}/${LANE}`);
      });

      it('should leave the foreign-hosted lane’s branch exactly as it was', () => {
        expect(branchTipSha(LANE)).to.equal(shaBefore);
        expect(fileOnBranch(LANE, 'comp1/index.js')).to.include('hosted-elsewhere-snap');
        // The rival lane's content never reached the branch.
        expect(fileOnBranch(LANE, 'comp2/index.js')).to.not.include('rival-lane-snap');
      });
    });
  });

  // D2 proves the default (halt); this block proves the two automatic policies on the same shape.
  // The load-bearing assertions are on file bytes — a policy that "succeeded" while dropping either
  // half would pass any summary-line check.
  describe('sync.onConflict resolves a same-line divergence without a human (git-wins / lane-wins)', () => {
    const LANE = 'policy-lane';
    let defaultBranch: string;
    let devPath: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      setSyncConfig({ lanes: ['*'], onConflict: 'git-wins' });
      defaultBranch = setupComponentsAndInitialCommit();

      devPath = helper.scopeHelper.cloneWorkspace();
      helper.command.runCmd(`bit lane create ${LANE}`, devPath);
      fs.outputFileSync(path.join(devPath, 'comp1', 'index.js'), comp1Src('lane-snap-1'));
      helper.command.runCmd('bit snap --message "lane snap 1"', devPath);
      helper.command.runCmd('bit export', devPath);

      // First sync gives the pair a shared state to diverge FROM.
      const first = runBit(`bit ci sync ${LANE}`);
      if (first.exitCode !== 0) throw new Error(`setup sync failed:\n${first.output}`);
      gitFetch();
    });

    describe('git-wins: the branch keeps the contested line, the lane still contributes the rest', () => {
      let output: string;
      let exitCode: number;
      let laneBefore: string;
      before(() => {
        // Same-line conflict on comp1, plus a non-conflicting comp2 move the policy must not throw
        // away — the policy decides conflicts, never the whole merge.
        laneSideEdit(devPath, 'comp1/index.js', comp1Src('lane-take'), 'lane conflicting snap');
        laneSideEdit(devPath, 'comp2/index.js', comp2Src('lane-side-2'), 'lane edits comp2');
        branchSideCommit(
          LANE,
          defaultBranch,
          'comp1/index.js',
          comp1Src('branch-take'),
          'feat: dev edits the same comp1 line on the branch'
        );
        laneBefore = remoteLaneFingerprint(LANE);
        ({ output, exitCode } = runBit(`bit ci sync ${LANE}`));
        gitFetch();
      });

      it('should succeed, naming the policy and the resolved file count in the summary', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        expect(output).to.include(
          `${LANE} -> merge-diverged (conflicts auto-resolved: git-wins on 1 file(s); ` +
            `merged lane into branch, then exported;`
        );
      });

      it("should keep the BRANCH's version of the contested line, with no conflict markers", () => {
        const onBranch = fileOnBranch(LANE, 'comp1/index.js');
        expect(onBranch, `comp1/index.js on origin/${LANE}:\n${onBranch}`).to.include('branch-take');
        expect(onBranch).to.not.include('lane-take');
        expect(onBranch).to.not.include('<<<<<<<');
      });

      it("should still take the lane's non-conflicting change onto the branch", () => {
        expect(fileOnBranch(LANE, 'comp2/index.js')).to.include('lane-side-2');
      });

      it('should advance the lane to the merged snap — the resolution is a normal sync commit', () => {
        expect(remoteLaneFingerprint(LANE)).to.not.equal(laneBefore);
        expect(laneTipFile(devPath, 'comp1/index.js')).to.include('branch-take');
        expect(laneTipFile(devPath, 'comp2/index.js')).to.include('lane-side-2');
      });

      it('should tip the branch with a reconciler-authored sync commit', () => {
        expect(branchTipMessage(LANE)).to.include('[bit-sync]');
      });

      describe('re-running right after the policy resolution', () => {
        let rerun: { output: string; exitCode: number };
        let shaBefore: string;
        before(() => {
          shaBefore = branchTipSha(LANE);
          rerun = runBit(`bit ci sync ${LANE}`);
          gitFetch();
        });
        it('should be a converged no-op', () => {
          expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
          expect(rerun.output).to.include(`${LANE} -> noop (converged)`);
          expect(branchTipSha(LANE)).to.equal(shaBefore);
        });
      });
    });

    describe('lane-wins: the lane keeps the contested line', () => {
      let output: string;
      let exitCode: number;
      before(() => {
        setSyncConfig({ lanes: ['*'], onConflict: 'lane-wins' });
        // Must be committed: the run reads the DEFAULT branch's committed config, never a
        // working-tree edit (which the forced checkout below discards).
        helper.command.runCmd('git add workspace.jsonc');
        helper.command.runCmd('git commit -m "config: onConflict lane-wins"');
        helper.command.runCmd(`git push origin ${defaultBranch}`);
        laneSideEdit(devPath, 'comp1/index.js', comp1Src('lane-take-2'), 'lane conflicting snap 2');
        branchSideCommit(
          LANE,
          defaultBranch,
          'comp1/index.js',
          comp1Src('branch-take-2'),
          'feat: dev edits the same comp1 line again'
        );
        ({ output, exitCode } = runBit(`bit ci sync ${LANE}`));
        gitFetch();
      });

      it('should succeed, naming the policy in the summary', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        expect(output).to.include('conflicts auto-resolved: lane-wins on 1 file(s)');
      });

      it("should take the LANE's version of the contested line onto the branch, with no markers", () => {
        const onBranch = fileOnBranch(LANE, 'comp1/index.js');
        expect(onBranch, `comp1/index.js on origin/${LANE}:\n${onBranch}`).to.include('lane-take-2');
        expect(onBranch).to.not.include('branch-take-2');
        expect(onBranch).to.not.include('<<<<<<<');
      });

      it("should keep the lane's own version on the lane tip", () => {
        expect(laneTipFile(devPath, 'comp1/index.js')).to.include('lane-take-2');
      });
    });
  });

  describe('bit ci sync --init (onboarding scaffolding)', () => {
    let defaultBranch: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      defaultBranch = setupComponentsAndInitialCommit();
    });

    function workflowPath(name: string): string {
      return path.join(helper.scopes.localPath, '.github', 'workflows', name);
    }

    it('scaffolds both workflow files with the real default branch substituted, adds the sync config block, prints the checklist, and exits 0', () => {
      const { output, exitCode } = runBit('bit ci sync --init');
      expect(exitCode, `bit ci sync --init output:\n${output}`).to.equal(0);

      expect(fs.existsSync(workflowPath('bit-sync.yml')), 'bit-sync.yml should have been written').to.be.true;
      expect(fs.existsSync(workflowPath('bit-release.yml')), 'bit-release.yml should have been written').to.be.true;

      const syncYml = fs.readFileSync(workflowPath('bit-sync.yml'), 'utf8');
      const releaseYml = fs.readFileSync(workflowPath('bit-release.yml'), 'utf8');
      // single-quoted: see `yamlSingleQuoted` in init-scaffold.ts.
      expect(syncYml).to.include(`branches-ignore: ['${defaultBranch}', 'bit-sync/**']`);
      expect(releaseYml).to.include(`branches: ['${defaultBranch}']`);
      // the mainSyncBranch default must survive the substitution untouched
      expect(syncYml).to.include('main-sync-branch: bit-sync/main');
      expect(releaseYml).to.include("github.event.pull_request.head.ref != 'bit-sync/main'");

      expect(output).to.include('wrote .github/workflows/bit-sync.yml');
      expect(output).to.include('wrote .github/workflows/bit-release.yml');
      expect(output).to.include('added "teambit.git/ci": { "sync": {} } to workspace.jsonc');

      const wsConfig = helper.workspaceJsonc.read();
      expect(wsConfig['teambit.git/ci'].sync).to.deep.equal({});

      // the manual-steps checklist
      expect(output).to.include('BIT_CONFIG_ACCESS_TOKEN');
      expect(output).to.include('BIT_SYNC_GH_TOKEN');
      expect(output).to.include('Components > Export');
      expect(output).to.include('drops its custom headers');
      expect(output).to.include('fetch-depth: 0');
    });

    it('is idempotent: a second run skips both files and the config block, and still exits 0', () => {
      const syncYmlBefore = fs.readFileSync(workflowPath('bit-sync.yml'), 'utf8');
      const releaseYmlBefore = fs.readFileSync(workflowPath('bit-release.yml'), 'utf8');

      const { output, exitCode } = runBit('bit ci sync --init');
      expect(exitCode, `bit ci sync --init output:\n${output}`).to.equal(0);
      expect(output).to.include('skipped .github/workflows/bit-sync.yml');
      expect(output).to.include('skipped .github/workflows/bit-release.yml');
      expect(output).to.include('workspace.jsonc already configures "teambit.git/ci".sync');

      expect(fs.readFileSync(workflowPath('bit-sync.yml'), 'utf8')).to.equal(syncYmlBefore);
      expect(fs.readFileSync(workflowPath('bit-release.yml'), 'utf8')).to.equal(releaseYmlBefore);
    });

    // Built by hand because bit refuses to `init` a workspace inside another workspace — the repo
    // root must be a plain git repo that is NOT itself a workspace, exactly how a monorepo looks.
    describe('a workspace in a subdirectory of the git repository', () => {
      let repoRoot: string;
      let wsDir: string;
      let output: string;
      let exitCode: number;

      before(() => {
        repoRoot = path.join(path.dirname(helper.scopes.localPath), `subdir-repo-${Date.now()}`);
        wsDir = path.join(repoRoot, 'packages', 'app');
        fs.mkdirpSync(wsDir);
        helper.command.runCmd('git init', repoRoot);
        helper.command.runCmd('bit init', wsDir);
        ({ output, exitCode } = runBit('bit ci sync --init', wsDir));
      });

      it('should be non-vacuous: the run really used the SUBDIRECTORY workspace', () => {
        expect(exitCode, `bit ci sync --init output:\n${output}`).to.equal(0);
        expect(fs.existsSync(path.join(wsDir, 'workspace.jsonc')), 'the subdir must be its own workspace').to.be.true;
        expect(output).to.include('added "teambit.git/ci": { "sync": {} } to workspace.jsonc');
        expect(fs.readFileSync(path.join(wsDir, 'workspace.jsonc'), 'utf8')).to.include('teambit.git/ci');
        expect(fs.existsSync(path.join(repoRoot, 'workspace.jsonc'))).to.be.false;
      });

      it('should write the workflows at the REPOSITORY root, never under the workspace', () => {
        expect(
          fs.existsSync(path.join(repoRoot, '.github', 'workflows', 'bit-sync.yml')),
          'bit-sync.yml belongs at the repo root, where GitHub looks for it'
        ).to.be.true;
        expect(fs.existsSync(path.join(repoRoot, '.github', 'workflows', 'bit-release.yml'))).to.be.true;
        expect(
          fs.existsSync(path.join(wsDir, '.github')),
          'no .github may be created under the subdirectory workspace — GitHub would never discover it'
        ).to.be.false;
      });

      it('should report a path that resolves from where the user is standing', () => {
        expect(output).to.match(/wrote .*\.github[/\\]workflows[/\\]bit-sync\.yml/);
        expect(output).to.not.match(/wrote \.github[/\\]workflows[/\\]bit-sync\.yml/);
      });
    });

    it('refuses to combine --init with another flag rather than silently ignoring one of them', () => {
      const { output, exitCode } = runBit('bit ci sync --init --dry-run');
      expect(exitCode, `bit ci sync --init --dry-run output:\n${output}`).to.not.equal(0);
      expect(output).to.include('--init');
      expect(output).to.include('cannot be combined');
    });
  });
});
