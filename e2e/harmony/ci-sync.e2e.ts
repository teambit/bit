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
 *
 * ONE cell per reconcile run: the run is the expensive part, so every facet of the same run is an
 * expect inside that cell, and the cells of a block run in order against one shared workspace.
 */
describe('bit ci sync', function () {
  this.timeout(0);

  let helper: Helper;
  const envGuard = createGitHostEnvGuard();
  const {
    setupGitRemote,
    setupComponentsAndInitialCommit,
    setSyncConfig,
    setupSyncWorkspace,
    createLaneWithSnap,
    runBit,
    gitFetch,
    syncRun,
    seedSync,
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
      ({ defaultBranch } = setupSyncWorkspace({ lanes: ['*'] }));
      // The "developer on bit.cloud" whose lane the reconciler mirrors.
      devPath = createLaneWithSnap(LANE, { 'comp1/index.js': comp1Src('lane-snap-1') }, 'lane snap 1');
    });

    // The file-content expects are load-bearing: a `forceOurs` switch produces a `.bitmap`-only commit
    // whose files still hold the default branch's content, and passes any commit-existence check.
    it('A: a remote lane with no branch is imported onto a new branch, PR-less, content and pointer committed', () => {
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> import-lane`);
      expect(output).to.include(NO_GIT_HOST_WARNING);
      expect(output).to.include(`skipping PR creation for ${LANE}`);
      expect(remoteBranchExists(LANE)).to.be.true;
      const message = branchTipMessage(LANE);
      expect(message).to.include('[bit-sync]');
      expect(message).to.include('Bit-Lane-Head:');
      expect(laneHeadTrailer(LANE)).to.be.a('string').with.lengthOf(40);
      const onBranch = fileOnBranch(LANE, 'comp1/index.js');
      expect(onBranch, `comp1/index.js on origin/${LANE}:\n${onBranch}`).to.include('lane-snap-1');
      expect(onBranch).to.not.include('comp1: initial');
      // non-vacuous: the fork point still holds the pre-lane content.
      expect(fileOnBranch(defaultBranch, 'comp1/index.js')).to.include('comp1: initial');
      // the lane pointer in `.bitmap` is what lets later runs merge into the branch
      expect(fileOnBranch(LANE, '.bitmap')).to.include(LANE);
      expect(helper.command.runCmd('git branch --show-current').trim()).to.equal(defaultBranch);
      expect(helper.command.listLanesParsed().currentLane).to.equal('main');
    });

    // The suite's standalone idempotency scenario: a run whose only input is the previous run's output.
    it('B: re-running with nothing moved is a converged no-op that recognizes its own sync commit', () => {
      const shaBefore = branchTipSha(LANE);
      const laneBefore = remoteLaneFingerprint(LANE);
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> noop (converged)`);
      expect(output).to.include('branch tip is a bit-sync commit');
      expect(branchTipSha(LANE)).to.equal(shaBefore);
      expect(remoteLaneFingerprint(LANE)).to.equal(laneBefore);
    });

    it('C: a dev commit on the branch is snapped onto the lane under a fresh trailer, then converges', () => {
      const laneBefore = remoteLaneFingerprint(LANE);
      const trailerBefore = laneHeadTrailer(LANE);
      const devCommitSha = branchSideCommit(
        LANE,
        defaultBranch,
        'comp2/index.js',
        comp2Src('branch-dev-1'),
        'feat: dev edits comp2 on the branch'
      );
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> export-branch`);
      expect(remoteLaneFingerprint(LANE)).to.not.equal(laneBefore);
      expect(laneTipFile(devPath, 'comp2/index.js')).to.include('branch-dev-1');
      const tip = branchTipSha(LANE);
      expect(tip).to.not.equal(devCommitSha);
      expect(branchTipMessage(LANE)).to.include('[bit-sync]');
      expect(laneHeadTrailer(LANE)).to.be.a('string').and.to.not.equal(trailerBefore);
      // never force-pushed: the developer's commit is still in the history
      expect(helper.command.runCmd(`git log origin/${LANE} --format=%H`)).to.include(devCommitSha);
      const rerun = syncRun(LANE);
      expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
      expect(rerun.output).to.include(`${LANE} -> noop (converged)`);
      expect(branchTipSha(LANE)).to.equal(tip);
    });

    it('D1: both sides moved on DIFFERENT files -> merged into the branch before snapping, then converges', () => {
      const trailerBefore = laneHeadTrailer(LANE);
      // lane side moves comp1, the branch independently moves comp2.
      laneSideEdit(devPath, 'comp1/index.js', comp1Src('lane-snap-2'), 'lane snap 2');
      branchSideCommit(
        LANE,
        defaultBranch,
        'comp2/index.js',
        comp2Src('branch-dev-2'),
        'feat: dev edits comp2 again on the branch'
      );
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> merge-diverged`);
      expect(output).to.include('Merging lane');
      expect(output).to.include('with no conflicts');
      expect(fileOnBranch(LANE, 'comp1/index.js')).to.include('lane-snap-2');
      expect(fileOnBranch(LANE, 'comp2/index.js')).to.include('branch-dev-2');
      // A snap-before-merge would silently revert the lane-side edit on the lane tip.
      const laneComp1 = laneTipFile(devPath, 'comp1/index.js');
      expect(laneComp1, `comp1/index.js at the lane tip:\n${laneComp1}`).to.include('lane-snap-2');
      expect(laneComp1).to.not.include('lane-snap-1;');
      expect(laneTipFile(devPath, 'comp2/index.js')).to.include('branch-dev-2');
      expect(branchTipMessage(LANE)).to.include('[bit-sync]');
      expect(laneHeadTrailer(LANE)).to.not.equal(trailerBefore);
      const tip = branchTipSha(LANE);
      const rerun = syncRun(LANE);
      expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
      expect(rerun.output).to.include(`${LANE} -> noop (converged)`);
      expect(branchTipSha(LANE)).to.equal(tip);
    });

    it('D2: both sides edited the SAME line -> halts non-zero, naming the component, writing to neither side', () => {
      laneSideEdit(devPath, 'comp1/index.js', comp1Src('lane-conflict'), 'lane conflicting snap');
      const devCommitSha = branchSideCommit(
        LANE,
        defaultBranch,
        'comp1/index.js',
        comp1Src('branch-conflict'),
        'feat: dev edits the same comp1 line on the branch'
      );
      const laneBefore = remoteLaneFingerprint(LANE);
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.not.equal(0);
      expect(output).to.include('Cannot sync lane');
      expect(output).to.include('merge conflicts in');
      expect(output).to.include('comp1');
      expect(output).to.include('bit ci sync could not reconcile 1 target(s)');
      expect(output).to.include('HALTED');
      expect(output).to.include(`skipping conflict label/comment for ${LANE}`);
      expect(branchTipSha(LANE)).to.equal(devCommitSha);
      expect(branchTipMessage(LANE)).to.not.include('[bit-sync]');
      expect(remoteLaneFingerprint(LANE)).to.equal(laneBefore);
      const onBranch = fileOnBranch(LANE, 'comp1/index.js');
      expect(onBranch).to.include('branch-conflict');
      expect(onBranch).to.not.include('<<<<<<<');
      expect(helper.command.runCmd('git branch --show-current').trim()).to.equal(defaultBranch);
      expect(helper.command.listLanesParsed().currentLane).to.equal('main');
    });

    // D2 left the tip at a dev commit whose content exists in NO other ref: own-live with dev commits,
    // so the branch must be kept. Genuine-deletion coverage lives in the later blocks.
    it('a lane removed remotely while its branch holds unexported work: close-pr keeps the branch, twice', () => {
      const tipBefore = branchTipSha(LANE);
      // --force: the lane carries snaps never merged into main; without it the remove refuses.
      helper.command.removeRemoteLane(LANE, '--force');
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> close-pr`);
      expect(output).to.include(`skipping PR close for ${LANE}`);
      expect(output).to.include('lane removed remotely but branch carries unmerged commits; keeping branch');
      expect(output).to.include(`branch ${LANE} kept`);
      expect(remoteBranchExists(LANE), `origin/${LANE} must survive — its commits exist nowhere else`).to.be.true;
      expect(branchTipSha(LANE)).to.equal(tipBefore);
      expect(fileOnBranch(LANE, 'comp1/index.js')).to.include('branch-conflict');
      const rerun = syncRun(LANE);
      expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
      expect(rerun.output).to.include(`branch ${LANE} kept`);
      expect(remoteBranchExists(LANE)).to.be.true;
      expect(branchTipSha(LANE)).to.equal(tipBefore);
    });
  });

  // F must observe pristine remote refs WHILE drift exists — exactly the state E needs before it
  // runs — so F comes first and E right after it.
  describe('main-scope sync and --dry-run (scenarios E, F)', () => {
    const LANE = 'dry-lane';
    const SYNC_BRANCH = 'bit-sync/main';
    let defaultBranch: string;

    before(() => {
      ({ defaultBranch } = setupSyncWorkspace({ lanes: ['*'] }));
      // one clone drives a lane (so `--all` has a lane target to plan), a second moves the main scope
      createLaneWithSnap(LANE, { 'comp2/index.js': comp2Src('dry-lane-snap') }, 'dry lane snap');
      const devMainPath = helper.scopeHelper.cloneWorkspace();

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

    it('F: --all --dry-run plans an action per target and leaves every ref on the git remote untouched', () => {
      const refsBefore = remoteRefs();
      const { output, exitCode } = syncRun('--all --dry-run');
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include('Dry-run');
      expect(output).to.include(`${LANE} -> import-lane`);
      expect(output).to.include('would open sync PR');
      // the no-write claim is not vacuous only if the drift it would act on was really detected
      expect(output).to.include('main -> drift in');
      expect(remoteRefs()).to.equal(refsBefore);
      expect(remoteBranchExists(LANE)).to.be.false;
      expect(remoteBranchExists(SYNC_BRANCH)).to.be.false;
    });

    // A planned halt must exit non-zero exactly as the real run would — `summarizeSync` recognizes the
    // HALTED prefix and nothing else. The shape: the lane's branch carries dev commits but records no bit
    // state for it, so the planner cannot tell which side is newer.
    it('F2: a --dry-run whose PLAN is a halt exits non-zero, with the prefix the real run uses', () => {
      const refsBefore = remoteRefs();
      helper.command.runCmd(`git checkout -f -b ${LANE} origin/${defaultBranch}`);
      helper.fs.outputFile('docs/plan.md', 'dev work this repository never gave bit any state for\n');
      helper.command.runCmd('git add -A');
      helper.command.runCmd('git commit -m "docs: dev work on a lane-mapped branch"');
      helper.command.runCmd(`git push origin ${LANE}`);
      helper.command.runCmd(`git checkout -f ${defaultBranch}`);
      try {
        const { output, exitCode } = syncRun(`${LANE} --dry-run`);
        expect(exitCode, `bit ci sync --dry-run output:\n${output}`).to.not.equal(0);
        expect(output).to.include(`HALTED ${LANE} -> branch has commits but its .bitmap records no state`);
        expect(output).to.include('bit ci sync could not reconcile 1 target(s)');
        expect(output).to.include('Dry-run:');
      } finally {
        // leave the block's refs as F found them — the local branch too, or the next run refuses to reset it
        helper.command.runCmd(`git push origin :refs/heads/${LANE}`);
        helper.command.runCmd(`git branch -D ${LANE}`);
        gitFetch();
      }
      expect(remoteRefs()).to.equal(refsBefore);
    });

    it('E: --main pushes the scope-resolved drift onto the sync branch, never the default branch, then converges', () => {
      const { output, exitCode } = syncRun('--main');
      // unexported source drift on the default branch must not halt the run
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.not.include('HALTED');
      expect(output).to.not.include('auto-merge-resolve');
      expect(output).to.include(`main -> pushed sync commit to ${SYNC_BRANCH}`);
      expect(output).to.include(NO_GIT_HOST_WARNING);
      expect(output).to.include('pushed sync branch, skipping PR operations');
      expect(remoteBranchExists(SYNC_BRANCH)).to.be.true;
      const message = branchTipMessage(SYNC_BRANCH);
      expect(message).to.include('[bit-sync]');
      expect(message).to.include('chore(bit-sync): sync git to latest main scope versions');
      expect(fileOnBranch(SYNC_BRANCH, 'comp2/index.js')).to.include('main-scope-v2');
      // the conflicted file is resolved in favour of the SCOPE, not the git drift
      const onBranch = fileOnBranch(SYNC_BRANCH, 'comp1/index.js');
      expect(onBranch, `comp1/index.js on origin/${SYNC_BRANCH}:\n${onBranch}`).to.include('main-scope-v2');
      expect(onBranch).to.not.include('unexported-git-drift');
      // non-vacuous: the default branch still holds the drift, and never gained the scope's version.
      expect(fileOnBranch(defaultBranch, 'comp1/index.js')).to.include('unexported-git-drift');
      expect(fileOnBranch(defaultBranch, 'comp2/index.js')).to.include('comp2: initial');
      expect(helper.command.runCmd('git branch --show-current').trim()).to.equal(defaultBranch);
      const tip = branchTipSha(SYNC_BRANCH);
      const rerun = syncRun('--main');
      expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
      expect(rerun.output).to.include('main -> converged');
      expect(branchTipSha(SYNC_BRANCH)).to.equal(tip);
    });

    it('--all reconciles the lane and the main scope in one run', () => {
      const { output, exitCode } = syncRun('--all');
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> import-lane`);
      expect(output).to.include('main ->');
      expect(remoteBranchExists(LANE)).to.be.true;
      expect(fileOnBranch(LANE, 'comp2/index.js')).to.include('dry-lane-snap');
      expect(branchTipMessage(LANE)).to.include('Bit-Lane-Head:');
    });

    // The main-sync path force-checkouts the sync branch to compute the drift by diff, BEFORE the
    // dry-run return — so before this guard a dry run exited 0 with the developer's edit destroyed.
    it('--main --dry-run over uncommitted work refuses, and leaves that work exactly as it was', () => {
      const edit = comp1Src('uncommitted-local-edit-that-must-survive');
      const untrackedDir = 'scratch';
      helper.fs.outputFile('comp1/index.js', edit);
      helper.fs.outputFile(`${untrackedDir}/notes.txt`, 'untracked scratch\n');

      const { output, exitCode } = runBit('bit ci sync --main --dry-run');
      expect(exitCode, `bit ci sync output:\n${output}`).to.not.equal(0);
      expect(output).to.include('--dry-run refuses to run');
      expect(output).to.include('comp1/index.js');
      expect(output).to.include('Commit or stash them first');
      expect(fs.readFileSync(path.join(helper.scopes.localPath, 'comp1', 'index.js')).toString()).to.equal(edit);
      expect(path.join(helper.scopes.localPath, untrackedDir, 'notes.txt')).to.be.a.path();

      // leave the block's workspace as the other cells found it
      helper.command.runCmd('git checkout -- comp1/index.js');
      fs.removeSync(path.join(helper.scopes.localPath, untrackedDir));
    });
  });

  // The load-bearing half is the negative: `bit-sync/main` is never created or touched, checked both
  // on the run that pushes and on the converged rerun.
  describe('main-scope direct push (mainSync: direct-push)', () => {
    const SYNC_BRANCH = 'bit-sync/main';
    let defaultBranch: string;

    before(() => {
      ({ defaultBranch } = setupSyncWorkspace({ lanes: ['*'], mainSync: 'direct-push' }));
      // The same drift recipe as scenario E.
      const devMainPath = helper.scopeHelper.cloneWorkspace();
      fs.outputFileSync(path.join(devMainPath, 'comp1', 'index.js'), comp1Src('direct-push-v2'));
      helper.command.runCmd('bit tag --message "bump comp1 on main"', devMainPath);
      helper.command.runCmd('bit export', devMainPath);
    });

    it('should push the drift onto the default branch itself, never creating the sync branch, then converge', () => {
      const { output, exitCode } = syncRun('--main');
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      const summary = output.match(/main -> direct-push \(pushed (\S+) @ ([0-9a-f]{7,40})\)/);
      expect(summary, `expected a direct-push summary in:\n${output}`).to.not.be.null;
      expect(summary![1]).to.equal(defaultBranch);
      // the sha in the summary is the tip that was actually pushed
      expect(branchTipSha(defaultBranch).startsWith(summary![2])).to.be.true;
      const message = branchTipMessage(defaultBranch);
      expect(message).to.include('[bit-sync]');
      expect(message).to.include('chore(bit-sync): sync git to latest main scope versions');
      expect(fileOnBranch(defaultBranch, 'comp1/index.js')).to.include('direct-push-v2');
      expect(remoteBranchExists(SYNC_BRANCH)).to.be.false;
      expect(output).to.not.include('skipping PR operations');
      expect(output).to.not.include('sync PR');
      expect(helper.command.runCmd('git branch --show-current').trim()).to.equal(defaultBranch);
      expect(helper.command.listLanesParsed().currentLane).to.equal('main');
      const tip = branchTipSha(defaultBranch);
      const rerun = syncRun('--main');
      expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
      expect(rerun.output).to.include('main -> converged');
      expect(branchTipSha(defaultBranch)).to.equal(tip);
      expect(remoteBranchExists(SYNC_BRANCH)).to.be.false;
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
      ({ defaultBranch } = setupSyncWorkspace({ lanes: ['*'] }));

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
      devB = createLaneWithSnap(LANE_B, { 'comp2/index.js': comp2Src('lane-b-snap-1') }, 'lane b snap 1');
    });

    it('should import both lanes onto their own branches, leaving an ordinary developer branch alone', () => {
      const { output, exitCode } = syncRun('--all');
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE_A} -> import-lane`);
      expect(output).to.include(`${LANE_B} -> import-lane`);
      expect(fileOnBranch(LANE_A, 'comp1/index.js')).to.include('lane-a-snap-1');
      expect(fileOnBranch(LANE_B, 'comp2/index.js')).to.include('lane-b-snap-1');
      // `feature-x` reaches the planner with the same input as a deleted lane's branch; only the
      // absence of a lane pointer in its committed `.bitmap` makes it a no-op.
      expect(output, `bit ci sync output:\n${output}`).to.include(
        `${PLAIN_BRANCH} -> noop (branch maps to no lane and has no sync history`
      );
      expect(remoteBranchExists(PLAIN_BRANCH), `origin/${PLAIN_BRANCH} must still exist`).to.be.true;
      expect(branchTipSha(PLAIN_BRANCH)).to.equal(plainBranchSha);
      expect(fileOnBranch(PLAIN_BRANCH, 'docs/notes.md')).to.include('must not be destroyed');
      // Lane A runs first; without the restore cleaning up, lane B's `add -A` would commit comp3.
      const onA = branchPathsMatching(LANE_A, 'comp3');
      expect(onA, `paths mentioning comp3 on origin/${LANE_A}`).to.not.have.lengthOf(0);
      expect(fileOnBranch(LANE_A, onA.find((p) => p.endsWith('index.js')) as string)).to.include('lane-a-only');
      expect(branchPathsMatching(LANE_B, 'comp3'), `comp3 must not exist on origin/${LANE_B}`).to.have.lengthOf(0);
      expect(helper.command.runCmd('git branch --show-current').trim()).to.equal(defaultBranch);
      expect(helper.command.listLanesParsed().currentLane).to.equal('main');
    });

    it('should halt the conflicting lane, leave it untouched, and still reconcile the lane after it', () => {
      // lane A diverges irreconcilably: both sides edit the same comp1 line.
      laneSideEdit(devA, 'comp1/index.js', comp1Src('lane-a-conflict'), 'lane a conflicting snap');
      const devCommitShaA = branchSideCommit(
        LANE_A,
        defaultBranch,
        'comp1/index.js',
        comp1Src('branch-a-conflict'),
        'feat: dev edits the same comp1 line on lane A branch'
      );
      // lane B, meanwhile, has ordinary work to mirror.
      laneSideEdit(devB, 'comp2/index.js', comp2Src('lane-b-snap-2'), 'lane b snap 2');
      const { output, exitCode } = syncRun('--all');
      expect(exitCode, `bit ci sync output:\n${output}`).to.not.equal(0);
      expect(output).to.include('HALTED');
      expect(output).to.include('merge conflicts in');
      expect(output).to.include('bit ci sync could not reconcile 1 target(s)');
      expect(branchTipSha(LANE_A)).to.equal(devCommitShaA);
      expect(branchTipMessage(LANE_A)).to.not.include('[bit-sync]');
      // the halt is per-lane, not per-run — and it must not leak files onto the surviving branch
      expect(output).to.include(`${LANE_B} -> import-lane`);
      expect(fileOnBranch(LANE_B, 'comp2/index.js')).to.include('lane-b-snap-2');
      expect(laneHeadTrailer(LANE_B)).to.be.a('string').with.lengthOf(40);
      expect(branchPathsMatching(LANE_B, 'comp3')).to.have.lengthOf(0);
      expect(fileOnBranch(LANE_B, 'comp1/index.js')).to.not.include('lane-a-conflict');
    });

    // A lane deleted on bit.cloud can only be visited through the branch half of the enumeration.
    it('should retire a lane deleted on bit.cloud, keep the rest of the run, and drop it from the next run', () => {
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
      seedSync(LANE_A);
      expect(branchTipMessage(LANE_A), 'the converge run must leave a sync commit at the tip').to.include('[bit-sync]');

      helper.command.removeRemoteLane(LANE_A, '--force');
      const { output, exitCode } = syncRun('--all');
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      // 3 = lane A (branch only), lane B (lane), and the ordinary developer branch.
      expect(output, `bit ci sync output:\n${output}`).to.include('Reconciling 3 mapped lane(s)');
      expect(output).to.include(`${LANE_A} -> close-pr`);
      expect(output).to.include(`branch ${LANE_A} deleted`);
      expect(remoteBranchExists(LANE_A)).to.be.false;
      expect(output).to.include(`skipping PR close for ${LANE_A}`);
      expect(output).to.include(`${LANE_B} -> noop (converged)`);
      expect(remoteBranchExists(LANE_B)).to.be.true;
      expect(fileOnBranch(LANE_B, 'comp2/index.js')).to.include('lane-b-snap-2');
      expect(remoteBranchExists(PLAIN_BRANCH)).to.be.true;
      expect(branchTipSha(PLAIN_BRANCH)).to.equal(plainBranchSha);

      const rerun = syncRun('--all');
      expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
      // 2 = lane B plus the ordinary developer branch; lane A is gone from both enumeration sources.
      expect(rerun.output).to.include('Reconciling 2 mapped lane(s)');
      expect(rerun.output).to.not.include(`${LANE_A} ->`);
      expect(rerun.output).to.include(`${LANE_B} -> noop (converged)`);
    });

    // Two defences proved at once: message text is not state (the decoy's forged trailer is never
    // read), and the state walk is `--first-parent` (a merged-in state-bearing commit is newer than
    // the branch's own and would otherwise outrank it).
    it('should read the branch’s OWN sync commit when a Bit-Lane-Head commit is merged in from elsewhere', () => {
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
      const { output, exitCode } = syncRun('--all');
      // Only the branch moved => export-branch; reading the decoy yields merge-diverged.
      expect(output, `bit ci sync output:\n${output}`).to.include(`${LANE_B} -> export-branch`);
      expect(output).to.not.include(`${LANE_B} -> merge-diverged`);
      expect(output).to.not.include(`${LANE_B} -> import-lane`);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(laneHeadTrailer(LANE_B)).to.not.equal('f'.repeat(40));
      const rerun = syncRun('--all');
      expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
      expect(rerun.output).to.include(`${LANE_B} -> noop (converged)`);
    });
  });

  // Walks one lane branch through all three ownership outcomes, plus the branch with inherited
  // history that must never be touched.
  describe('branch ownership decides what close-pr may delete', () => {
    const LANE = 'own-lane';
    /** an ordinary developer branch, forked from a default branch that already carries a sync trailer */
    const PLAIN_BRANCH = 'feature-x';
    let defaultBranch: string;
    let plainBranchSha: string;

    before(() => {
      ({ defaultBranch } = setupSyncWorkspace({ lanes: ['*'] }));
      createLaneWithSnap(LANE, { 'comp1/index.js': comp1Src('own-lane-snap') }, 'own lane snap');
      // Give the lane a real branch with a real sync commit of its own, before anything else happens.
      seedSync(LANE);

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

    it('should ignore a branch that INHERITED a sync trailer, on the structural evidence, twice over', () => {
      const { output, exitCode } = syncRun('--all');
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${PLAIN_BRANCH} -> noop (branch maps to no lane and has no sync history`);
      expect(remoteBranchExists(PLAIN_BRANCH), `origin/${PLAIN_BRANCH} must still exist`).to.be.true;
      expect(branchTipSha(PLAIN_BRANCH)).to.equal(plainBranchSha);
      expect(fileOnBranch(PLAIN_BRANCH, 'docs/plan.md')).to.include('must not be destroyed');
      // non-vacuous: the branch really does carry the inherited trailer it is ignored despite
      const log = helper.command.runCmd(`git log origin/${PLAIN_BRANCH} --first-parent --format=%B`);
      expect(log).to.include('Bit-Lane-Head:');
      expect(log).to.include(`sync lane ${helper.scopes.remote}/other-lane`);
      // the structural evidence that decides it: its `.bitmap` points at no lane
      expect(fileOnBranch(PLAIN_BRANCH, '.bitmap')).to.not.include('_bit_lane');
      const rerun = syncRun('--all');
      expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
      expect(rerun.output).to.include(`${PLAIN_BRANCH} -> noop`);
      expect(remoteBranchExists(PLAIN_BRANCH)).to.be.true;
      expect(branchTipSha(PLAIN_BRANCH)).to.equal(plainBranchSha);
    });

    it('own-superseded (sync history merged, tip is not): should close the PR but keep the branch, unmoved', () => {
      // 1. the sync commit lands in the default branch (the PR was merged) ...
      mergeLaneBranchIntoDefault();
      // 2. ... and then work continues on the branch, so the tip is ahead of the default branch again.
      branchSideCommit(LANE, defaultBranch, 'comp2/index.js', comp2Src('after-the-merge'), 'feat: more work');
      gitFetch();
      const tipBefore = branchTipSha(LANE);
      // 3. the lane is retired on bit.cloud.
      helper.command.removeRemoteLane(LANE, '--force');
      const { output, exitCode } = syncRun('--all');
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include('lane removed remotely but branch carries unmerged commits; keeping branch');
      expect(output).to.include(`branch ${LANE} kept`);
      expect(remoteBranchExists(LANE), `origin/${LANE} must survive — its commits exist nowhere else`).to.be.true;
      expect(branchTipSha(LANE)).to.equal(tipBefore);
      expect(fileOnBranch(LANE, 'comp2/index.js')).to.include('after-the-merge');
    });

    // Also the end-to-end proof that the leased delete refspec is one a real server accepts: a wrong
    // argv or a wrong expected sha leaves the branch in place, which the next line would catch.
    it('own-merged (fully merged into the default branch): should close the PR and delete the branch', () => {
      mergeLaneBranchIntoDefault();
      const { output, exitCode } = syncRun('--all');
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> close-pr`);
      expect(output).to.include(`branch ${LANE} deleted`);
      expect(remoteBranchExists(LANE)).to.be.false;
      // still not the ordinary developer branch, on any of the three runs
      expect(remoteBranchExists(PLAIN_BRANCH)).to.be.true;
      expect(branchTipSha(PLAIN_BRANCH)).to.equal(plainBranchSha);
    });
  });

  // Every input to the deletion decision is read from refs fetched once at the start of the run, so a
  // branch can advance before the delete lands. A `pre-push` hook is the only way to interleave a remote
  // update into the command's own push, i.e. to reach the window between the re-read and the delete.
  describe('a branch that advances between the ownership read and the delete is kept, not deleted', () => {
    const LANE = 'race-lane';
    let defaultBranch: string;
    let bareRepoPath: string;
    let hookPath: string;

    before(() => {
      ({ defaultBranch, bareRepoPath } = setupSyncWorkspace({ lanes: ['*'] }));
      createLaneWithSnap(LANE, { 'comp1/index.js': comp1Src('race-lane-snap') }, 'race lane snap');
      seedSync(LANE);
      // own-merged, so the plan really is a delete: `-s ours` records the merge without moving the tree.
      gitFetch();
      helper.command.runCmd(`git checkout -f -B ${defaultBranch} origin/${defaultBranch}`);
      helper.command.runCmd(`git merge -s ours --no-edit origin/${LANE}`);
      helper.command.runCmd(`git push origin ${defaultBranch}`);
      gitFetch();
      helper.command.removeRemoteLane(LANE, '--force');
      hookPath = path.join(helper.scopes.localPath, '.git', 'hooks', 'pre-push');
      // insurance against a global core.hooksPath on the machine running the suite
      helper.command.runCmd('git config core.hooksPath .git/hooks');
    });

    it('should keep the branch, name the race, and leave the racing commit as the tip', () => {
      const racedTo = branchTipSha(defaultBranch);
      // Runs while the delete push is in flight — after the command re-read the tip, before it lands.
      fs.outputFileSync(
        hookPath,
        `#!/bin/sh\ngit --git-dir='${bareRepoPath}' update-ref refs/heads/${LANE} ${racedTo}\nexit 0\n`
      );
      fs.chmodSync(hookPath, 0o755);
      try {
        const { output, exitCode } = syncRun('--all');
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        expect(output).to.include(`${LANE} -> close-pr`);
        expect(output).to.include(`branch ${LANE} kept`);
        expect(output).to.include('its tip advanced after the ownership evidence was read');
        expect(output).to.not.include(`branch ${LANE} deleted`);
        expect(remoteBranchExists(LANE), `origin/${LANE} must survive a racing update`).to.be.true;
        expect(branchTipSha(LANE)).to.equal(racedTo);
      } finally {
        fs.removeSync(hookPath);
      }
    });
  });

  // The cross-scope split: foreign CONTENT is refused outright; a foreign HOST is fine as long as the
  // content is this repo's, addressed by its scope-qualified id.
  describe('a lane whose components span two scopes is refused, never half-mirrored', () => {
    const LANE = 'cross-scope';
    const MID_FLIGHT_LANE = 'mid-flight';
    let otherScope: string;
    let devPath: string;
    let defaultBranch: string;
    let midFlightShaBefore: string;

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
      devPath = createLaneWithSnap(
        LANE,
        { 'comp1/index.js': comp1Src('cross-scope-snap'), 'comp2/index.js': comp2Src('cross-scope-snap') },
        'cross-scope lane snap'
      );
    });

    it('targeted explicitly: should refuse before planning, naming the foreign scope, and write nothing', () => {
      // setup sanity: the lane really does span two scopes
      const parsed = helper.command.listRemoteLanesParsed();
      const lane = parsed.lanes.find((l: any) => (l.id?.name ?? l.name) === LANE);
      const ids = (lane?.components ?? []).map((c: any) => (typeof c.id === 'string' ? c.id : c.id.toString()));
      expect(ids.join(' ')).to.include(`${otherScope}/comp2`);
      expect(ids.join(' ')).to.include(`${helper.scopes.remote}/comp1`);

      const refsBefore = remoteRefs();
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.not.equal(0);
      expect(output).to.include('cross-scope lane: components from scope(s)');
      expect(output).to.include(otherScope);
      expect(output).to.include(`this repo maps scope ${helper.scopes.remote}`);
      expect(output).to.include(`${otherScope}/comp2`);
      expect(output).to.include("see the docs' Cross-scope lanes section");
      expect(output).to.include('No branch was created and nothing was written');
      // not a halt: no bit-sync-conflict machinery is involved
      expect(output).to.not.include('HALTED');
      expect(output).to.not.include('bit-sync-conflict');
      // refused BEFORE planning — this shape would otherwise plan `import-lane`
      expect(output).to.not.include('import-lane');
      expect(remoteBranchExists(LANE)).to.be.false;
      expect(remoteRefs()).to.equal(refsBefore);
    });

    it('reached by an --all run: should SKIP it, keep the run green, and reconcile the rest of the run', () => {
      const { output, exitCode } = syncRun('--all');
      expect(exitCode, `bit ci sync --all output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> skipped (cross-scope lane:`);
      expect(output).to.include('no branch created');
      expect(output).to.not.include('HALTED');
      expect(remoteBranchExists(LANE)).to.be.false;
      expect(output).to.include('main ->');
    });

    it('a lane that became cross-scope AFTER its branch existed: should HALT and leave the branch put', () => {
      // Step off the cross-scope lane first — a lane forked from another lane inherits its
      // components — and restore both files so only the edit below counts as modified.
      helper.command.runCmd('bit switch main', devPath);
      fs.outputFileSync(path.join(devPath, 'comp1', 'index.js'), comp1Src('initial'));
      fs.outputFileSync(path.join(devPath, 'comp2', 'index.js'), comp2Src('initial'));
      helper.command.runCmd(`bit lane create ${MID_FLIGHT_LANE}`, devPath);
      fs.outputFileSync(path.join(devPath, 'comp1', 'index.js'), comp1Src('mid-flight-single-scope'));
      helper.command.runCmd(`bit snap --message "single-scope snap"`, devPath);
      helper.command.runCmd('bit export', devPath);
      seedSync(MID_FLIGHT_LANE);
      midFlightShaBefore = branchTipSha(MID_FLIGHT_LANE);

      // Phase 2: the lane grows a component from the OTHER scope.
      fs.outputFileSync(path.join(devPath, 'comp2', 'index.js'), comp2Src('mid-flight-foreign'));
      helper.command.runCmd(`bit snap --message "foreign-scope snap"`, devPath);
      helper.command.runCmd('bit export', devPath);

      const { output, exitCode } = syncRun(MID_FLIGHT_LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.not.equal(0);
      expect(output).to.include(`HALTED ${MID_FLIGHT_LANE} -> lane became cross-scope after it was mirrored onto`);
      expect(output).to.include('can no longer be reconciled automatically');
      expect(remoteBranchExists(MID_FLIGHT_LANE)).to.be.true;
      expect(branchTipSha(MID_FLIGHT_LANE)).to.equal(midFlightShaBefore);
    });

    // A single --all must report both cross-scope outcomes without either swallowing the other.
    it('should halt the mid-flight lane and skip the never-mirrored one, in the same --all run', () => {
      const { output, exitCode } = syncRun('--all');
      expect(exitCode, `bit ci sync --all output:\n${output}`).to.not.equal(0);
      expect(output).to.include(`HALTED ${MID_FLIGHT_LANE} -> lane became cross-scope`);
      expect(output).to.include(`${LANE} -> skipped (cross-scope lane:`);
      expect(branchTipSha(MID_FLIGHT_LANE)).to.equal(midFlightShaBefore);
    });

    // `--all` reaches the per-lane reconciler without the command layer's name checks, so the
    // reserved-branch guard has to live in the reconciler itself; this proves it does.
    it('a lane whose configured branch is the default branch: should be skipped before it is even read', () => {
      gitFetch();
      const shaBefore = branchTipSha(defaultBranch);
      setSyncConfig({ lanes: ['*'], branches: { [LANE]: defaultBranch } });
      const { output, exitCode } = syncRun('--all');
      expect(output).to.include(`${LANE} -> skipped`);
      expect(output).to.include(`maps to ${defaultBranch}`);
      expect(output).to.include('the main scope is reconciled by "bit ci sync --main"');
      // refused before even reading the lane, so the cross-scope check never gets a say
      expect(output).to.not.include(`${LANE} -> skipped (cross-scope lane:`);
      expect(branchTipSha(defaultBranch)).to.equal(shaBefore);
      expect(exitCode, `bit ci sync --all output:\n${output}`).to.not.equal(0); // the mid-flight lane still halts
      setSyncConfig({ lanes: ['*'] });
    });
  });

  describe('a lane hosted on another scope, with content in this repo scope, syncs when targeted by its id', () => {
    const LANE = 'hosted-elsewhere';
    let hostScope: string;
    let defaultBranch: string;

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
      createLaneWithSnap(
        LANE,
        { 'comp1/index.js': comp1Src('hosted-elsewhere-snap') },
        'snap on a foreign-hosted lane',
        `--scope ${hostScope}`
      );
    });

    it('targeted by its scope-qualified id: should mirror onto the branch its NAME maps to, id and all', () => {
      const { output, exitCode } = syncRun(`${hostScope}/${LANE}`);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> import-lane`);
      expect(remoteBranchExists(LANE)).to.be.true;
      expect(remoteBranchExists(`${hostScope}/${LANE}`)).to.be.false;
      // A pointer at `<defaultScope>/<name>` would name a lane that does not exist.
      const bitmap = fileOnBranch(LANE, '.bitmap');
      expect(bitmap).to.include('_bit_lane');
      expect(bitmap).to.include(hostScope);
      const message = branchTipMessage(LANE);
      expect(message).to.include(`sync lane ${hostScope}/${LANE}`);
      expect(message).to.include('[bit-sync]');
      expect(laneHeadTrailer(LANE)).to.be.a('string').with.lengthOf(40);
      const onBranch = fileOnBranch(LANE, 'comp1/index.js');
      expect(onBranch, `comp1/index.js on origin/${LANE}:\n${onBranch}`).to.include('hosted-elsewhere-snap');
      expect(fileOnBranch(defaultBranch, 'comp1/index.js')).to.include('comp1: initial');
      // the real lane id has to round-trip through the commit subject for this to re-read as converged
      const tip = branchTipSha(LANE);
      const rerun = syncRun(`${hostScope}/${LANE}`);
      expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
      expect(rerun.output).to.include(`${LANE} -> noop (converged)`);
      expect(branchTipSha(LANE)).to.equal(tip);
    });

    // A branch name carries no scope, so this resolves against `defaultScope`, mismatches the pointer,
    // and reads `inherited-or-none` — the safe direction of the Stage-0 trade.
    it('the same branch reached by NAME: should leave it alone rather than retire it', () => {
      const shaBefore = branchTipSha(LANE);
      const { output, exitCode } = syncRun(`--branch ${LANE}`);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> noop`);
      expect(output).to.not.include('close-pr');
      expect(remoteBranchExists(LANE)).to.be.true;
      expect(branchTipSha(LANE)).to.equal(shaBefore);
    });

    it('a same-named lane in THIS scope: should halt under --dry-run and for real, leaving the owner’s branch', () => {
      const shaBefore = branchTipSha(LANE);
      // Same lane NAME, this repository's own scope; `--alias` because the workspace already tracks
      // the foreign-hosted lane under that name locally.
      createLaneWithSnap(LANE, { 'comp2/index.js': comp2Src('rival-lane-snap') }, 'rival lane snap', '--alias rival');

      // The dry run goes FIRST: run after the real halt, the label would already be there and the
      // no-write claim would prove nothing.
      const refsBeforeDryRun = remoteRefs();
      const dry = syncRun(`${LANE} --dry-run`);
      expect(dry.exitCode, `bit ci sync --dry-run output:\n${dry.output}`).to.not.equal(0);
      expect(dry.output).to.include(`HALTED ${LANE} -> branch ${LANE} mirrors lane ${hostScope}/${LANE}`);
      // Proof the PR-writing branch was skipped rather than merely having had no PR to write to.
      expect(dry.output).to.include('Dry-run: the PR is not labelled or commented on');
      expect(remoteRefs()).to.equal(refsBeforeDryRun);

      // Bare name => this workspace's defaultScope, i.e. the rival lane.
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.not.equal(0);
      expect(output).to.include(`HALTED ${LANE} -> branch ${LANE} mirrors lane ${hostScope}/${LANE}`);
      expect(output).to.include(`refusing to plan for ${helper.scopes.remote}/${LANE}`);
      expect(branchTipSha(LANE)).to.equal(shaBefore);
      expect(fileOnBranch(LANE, 'comp1/index.js')).to.include('hosted-elsewhere-snap');
      // The rival lane's content never reached the branch.
      expect(fileOnBranch(LANE, 'comp2/index.js')).to.not.include('rival-lane-snap');
    });
  });

  // D2 proves the default (halt); these two prove the automatic policies on the same shape. The
  // load-bearing assertions are on file bytes — a policy that "succeeded" while dropping either half
  // would pass any summary-line check.
  describe('sync.onConflict resolves a same-line divergence without a human (git-wins / lane-wins)', () => {
    const LANE = 'policy-lane';
    let defaultBranch: string;
    let devPath: string;

    before(() => {
      ({ defaultBranch } = setupSyncWorkspace({ lanes: ['*'], onConflict: 'git-wins' }));
      devPath = createLaneWithSnap(LANE, { 'comp1/index.js': comp1Src('lane-snap-1') }, 'lane snap 1');
      // First sync gives the pair a shared state to diverge FROM.
      seedSync(LANE);
    });

    it('git-wins: should keep the branch’s contested line, take the lane’s rest, advance the lane, converge', () => {
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
      const laneBefore = remoteLaneFingerprint(LANE);
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(
        `${LANE} -> merge-diverged (conflicts auto-resolved: git-wins on 1 file(s); ` +
          `merged lane into branch, then exported;`
      );
      const onBranch = fileOnBranch(LANE, 'comp1/index.js');
      expect(onBranch, `comp1/index.js on origin/${LANE}:\n${onBranch}`).to.include('branch-take');
      expect(onBranch).to.not.include('lane-take');
      expect(onBranch).to.not.include('<<<<<<<');
      expect(fileOnBranch(LANE, 'comp2/index.js')).to.include('lane-side-2');
      // the resolution is a normal sync commit: the lane advances to the merged snap
      expect(remoteLaneFingerprint(LANE)).to.not.equal(laneBefore);
      expect(laneTipFile(devPath, 'comp1/index.js')).to.include('branch-take');
      expect(laneTipFile(devPath, 'comp2/index.js')).to.include('lane-side-2');
      expect(branchTipMessage(LANE)).to.include('[bit-sync]');
      const tip = branchTipSha(LANE);
      const rerun = syncRun(LANE);
      expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
      expect(rerun.output).to.include(`${LANE} -> noop (converged)`);
      expect(branchTipSha(LANE)).to.equal(tip);
    });

    it('lane-wins: should take the LANE’s version of the contested line onto the branch, with no markers', () => {
      setSyncConfig({ lanes: ['*'], onConflict: 'lane-wins' });
      // Must be committed: the run reads the DEFAULT branch's committed config, never a working-tree
      // edit (which the forced checkout discards).
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
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include('conflicts auto-resolved: lane-wins on 1 file(s)');
      const onBranch = fileOnBranch(LANE, 'comp1/index.js');
      expect(onBranch, `comp1/index.js on origin/${LANE}:\n${onBranch}`).to.include('lane-take-2');
      expect(onBranch).to.not.include('branch-take-2');
      expect(onBranch).to.not.include('<<<<<<<');
      expect(laneTipFile(devPath, 'comp1/index.js')).to.include('lane-take-2');
    });
  });

  describe('bit ci sync --init (onboarding scaffolding)', () => {
    let defaultBranch: string;

    before(() => {
      ({ defaultBranch } = setupSyncWorkspace());
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
      expect(helper.workspaceJsonc.read()['teambit.git/ci'].sync).to.deep.equal({});

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

    // Built by hand because bit refuses to `init` a workspace inside another workspace — the repo root
    // must be a plain git repo that is NOT itself a workspace, exactly how a monorepo looks.
    it('should write the workflows at the REPOSITORY root when the workspace is in a subdirectory', () => {
      const repoRoot = path.join(path.dirname(helper.scopes.localPath), `subdir-repo-${Date.now()}`);
      const wsDir = path.join(repoRoot, 'packages', 'app');
      fs.mkdirpSync(wsDir);
      helper.command.runCmd('git init', repoRoot);
      helper.command.runCmd('bit init', wsDir);
      const { output, exitCode } = runBit('bit ci sync --init', wsDir);

      // non-vacuous: the run really used the SUBDIRECTORY workspace
      expect(exitCode, `bit ci sync --init output:\n${output}`).to.equal(0);
      expect(fs.existsSync(path.join(wsDir, 'workspace.jsonc')), 'the subdir must be its own workspace').to.be.true;
      expect(output).to.include('added "teambit.git/ci": { "sync": {} } to workspace.jsonc');
      expect(fs.readFileSync(path.join(wsDir, 'workspace.jsonc'), 'utf8')).to.include('teambit.git/ci');
      expect(fs.existsSync(path.join(repoRoot, 'workspace.jsonc'))).to.be.false;

      expect(
        fs.existsSync(path.join(repoRoot, '.github', 'workflows', 'bit-sync.yml')),
        'bit-sync.yml belongs at the repo root, where GitHub looks for it'
      ).to.be.true;
      expect(fs.existsSync(path.join(repoRoot, '.github', 'workflows', 'bit-release.yml'))).to.be.true;
      expect(
        fs.existsSync(path.join(wsDir, '.github')),
        'no .github may be created under the subdirectory workspace — GitHub would never discover it'
      ).to.be.false;
      // the reported path resolves from where the user is standing
      expect(output).to.match(/wrote .*\.github[/\\]workflows[/\\]bit-sync\.yml/);
      expect(output).to.not.match(/wrote \.github[/\\]workflows[/\\]bit-sync\.yml/);
    });
  });

  // `bit add` + a committed versionless `.bitmap` entry + the component's first export on a lane —
  // the onboarding quickstart's state, and the one the adoption retry exists for.
  describe('a lane component that the workspace tracks as new and unexported (first lane export)', () => {
    const LANE = 'first-lane-export';
    let defaultBranch: string;

    before(() => {
      ({ defaultBranch } = setupSyncWorkspace({ lanes: ['*'] }));
      // commit the versionless `.bitmap` entry, as the onboarding step does
      helper.fs.outputFile('comp3/index.js', 'module.exports = () => "comp3: initial";');
      helper.command.addComponent('comp3');
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "track comp3 as a new component"');
      helper.command.runCmd(`git push origin ${defaultBranch}`);
      // the clone carries the same versionless entry
      createLaneWithSnap(
        LANE,
        { 'comp3/index.js': 'module.exports = () => "comp3: lane-snap-1";' },
        'comp3 first snap'
      );
    });

    it('imports the lane instead of halting on "the component was not found"', () => {
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> import-lane`);
      expect(remoteBranchExists(LANE)).to.be.true;
      const onBranch = fileOnBranch(LANE, 'comp3/index.js');
      expect(onBranch, `comp3/index.js on origin/${LANE}:\n${onBranch}`).to.include('comp3: lane-snap-1');
      // the branch `.bitmap` must record the lane version, not the versionless entry
      expect(fileOnBranch(LANE, '.bitmap')).to.include(LANE);
      // the workspace is restored: back on the default branch, on main
      expect(helper.command.runCmd('git branch --show-current').trim()).to.equal(defaultBranch);
      expect(helper.command.listLanesParsed().currentLane).to.equal('main');
    });
  });

  // A branch commit that touches no bit-tracked file (docs, CI config) gives export-branch nothing
  // to snap. The sync-ledger commit executeExportBranch still writes is `--allow-empty` and never
  // touches `.bitmap`, so `stateCommit` (sync-state.ts, derived from `.bitmap`'s content, never
  // commit messages) never advances past the docs commit — `hasDevCommits` stays true forever, and
  // every later run re-plans export-branch on top of the ledger commit it just wrote.
  describe('a commit that touches no bit-tracked file settles instead of looping', () => {
    const LANE = 'docs-only-lane';
    let defaultBranch: string;
    let devPath: string;

    before(() => {
      ({ defaultBranch } = setupSyncWorkspace({ lanes: ['*'] }));
      devPath = createLaneWithSnap(LANE, { 'comp1/index.js': comp1Src('lane-snap-1') }, 'lane snap 1');
      seedSync(LANE);
      branchSideCommit(LANE, defaultBranch, 'NOTES.md', '# notes\n', 'docs: add notes');
    });

    it('exports nothing to snap once, then settles — the second run does not redo export-branch work', () => {
      const first = syncRun(LANE);
      expect(first.exitCode, `bit ci sync output:\n${first.output}`).to.equal(0);
      expect(first.output).to.include(`${LANE} -> export-branch`);

      const second = syncRun(LANE);
      expect(second.exitCode, `bit ci sync output:\n${second.output}`).to.equal(0);
      // pins the settled summary's exact wording
      expect(second.output).to.include(
        `${LANE} -> noop (converged; branch tip is already this reconciler's own sync commit)`
      );
      // executeExportBranch's own work (the checkout, the snap attempt) never ran a second time
      expect(second.output).to.not.include('Exporting branch');
    });

    // The withhold settles; it does not trap. A real dev commit on top of the recognized ledger tip
    // must still clear it and export normally — the tip is no longer the reconciler's own commit.
    it('a real dev commit on top of the settled tip clears the withhold and exports again', () => {
      branchSideCommit(
        LANE,
        defaultBranch,
        'comp1/index.js',
        comp1Src('dev-commit-after-settle'),
        'dev commit after settling'
      );
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include('Exporting branch');
      expect(output).to.include(`${LANE} -> export-branch`);
      expect(output).to.not.include('branch tip is already this reconciler');
      expect(laneTipFile(devPath, 'comp1/index.js')).to.include('dev-commit-after-settle');
    });
  });

  describe('a stale bit-sync/main that conflicts with the default branch', () => {
    const SYNC_BRANCH = 'bit-sync/main';
    let defaultBranch: string;
    let devPath: string;

    before(() => {
      ({ defaultBranch } = setupSyncWorkspace({}));
      devPath = helper.scopeHelper.cloneWorkspace();
      // the scope moves ahead: both components tag 0.0.2; the sync branch proposes that drift
      fs.outputFileSync(path.join(devPath, 'comp1', 'index.js'), comp1Src('main-scope-v2'));
      fs.outputFileSync(path.join(devPath, 'comp2', 'index.js'), comp2Src('main-scope-v2'));
      helper.command.runCmd('bit tag --message "bump to 0.0.2"', devPath);
      helper.command.runCmd('bit export', devPath);
      seedSync('--main');
      // the default branch adopts comp1@0.0.3 while the sync branch recorded 0.0.2 — the same
      // `.bitmap` line on both sides, so the catch-up merge conflicts
      fs.outputFileSync(path.join(devPath, 'comp1', 'index.js'), comp1Src('main-scope-v3'));
      helper.command.runCmd('bit tag comp1 --message "bump comp1 to 0.0.3" --unmodified', devPath);
      helper.command.runCmd('bit export', devPath);
      helper.command.runCmd('bit checkout head comp1 -x');
      helper.command.runCmd('git add -A');
      helper.command.runCmd('git commit -m "chore: adopt comp1 0.0.3"');
      helper.command.runCmd(`git push origin ${defaultBranch}`);
      gitFetch();
    });

    it('re-forks the machine-owned branch from the default branch and pushes the remaining drift', () => {
      const tipBefore = branchTipSha(SYNC_BRANCH);
      const { output, exitCode } = syncRun('--main');
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.not.include('HALTED');
      expect(output).to.include('re-forking');
      expect(output).to.include(`main -> pushed sync commit to ${SYNC_BRANCH}`);
      expect(branchTipSha(SYNC_BRANCH)).to.not.equal(tipBefore);
      // the re-forked branch carries the default branch's comp1 and the scope's comp2 drift
      expect(fileOnBranch(SYNC_BRANCH, 'comp1/index.js')).to.include('main-scope-v3');
      expect(fileOnBranch(SYNC_BRANCH, 'comp2/index.js')).to.include('main-scope-v2');
      expect(fileOnBranch(SYNC_BRANCH, '.bitmap')).to.include('0.0.3');
      // non-vacuous: the default branch never gained the scope's comp2
      expect(fileOnBranch(defaultBranch, 'comp2/index.js')).to.include('comp2: initial');
      // the re-run is a converged no-op
      const rerun = syncRun('--main');
      expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
      expect(rerun.output).to.include('main -> converged');
    });

    it('keeps the halt when a human commit sits on the sync branch', () => {
      // a human pushes straight to the sync branch, and the default branch conflicts with the edit
      helper.command.runCmd(`git fetch origin ${SYNC_BRANCH}`);
      helper.command.runCmd(`git checkout -B ${SYNC_BRANCH} origin/${SYNC_BRANCH}`);
      helper.fs.outputFile('comp1/index.js', comp1Src('human-edit-on-sync-branch'));
      helper.command.runCmd('git add -A');
      helper.command.runCmd('git commit -m "fix: a human edit on the sync branch"');
      helper.command.runCmd(`git push origin ${SYNC_BRANCH}`);
      helper.command.runCmd(`git checkout ${defaultBranch}`);
      fs.outputFileSync(path.join(devPath, 'comp1', 'index.js'), comp1Src('main-scope-v4'));
      helper.command.runCmd('bit tag comp1 --message "bump comp1 to 0.0.4" --unmodified', devPath);
      helper.command.runCmd('bit export', devPath);
      helper.command.runCmd('bit checkout head comp1 -x');
      helper.command.runCmd('git add -A');
      helper.command.runCmd('git commit -m "chore: adopt comp1 0.0.4"');
      helper.command.runCmd(`git push origin ${defaultBranch}`);
      gitFetch();

      const tipBefore = branchTipSha(SYNC_BRANCH);
      const { output, exitCode } = syncRun('--main');
      expect(exitCode, `bit ci sync output:\n${output}`).to.not.equal(0);
      expect(output).to.include('could not bring the sync branch');
      expect(output).to.not.include('re-forking');
      // the human commit survives
      expect(branchTipSha(SYNC_BRANCH)).to.equal(tipBefore);
      expect(fileOnBranch(SYNC_BRANCH, 'comp1/index.js')).to.include('human-edit-on-sync-branch');
    });
  });
});
