import chai, { expect } from 'chai';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
import { NO_GIT_HOST_WARNING, comp1Src, comp2Src, createGitHostEnvGuard, syncE2eHelpers } from './ci-sync-support';
chai.use(chaiFs);

/**
 * the lane/branch reconcile cycle. Part of the `bit ci sync` e2e suite, which is split across several files so the CI
 * splitter can spread them over parallel nodes (see scripts/split-e2e-tests.js) - one file is
 * assigned whole, so a single large one sets the floor for the entire job.
 *
 * Every scenario runs against a local bare git repo as `origin` and a file:// remote scope, with the
 * git-host env unset for the file's duration. ONE cell per reconcile run: the run is the expensive
 * part, so every facet of the same run is an expect inside that cell.
 */
describe('bit ci sync: the lane/branch reconcile cycle', function () {
  this.timeout(0);

  let helper: Helper;
  const envGuard = createGitHostEnvGuard();
  const {
    setupSyncWorkspace,
    createLaneWithSnap,
    gitFetch,
    syncRun,
    seedSync,
    remoteBranchExists,
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
    // The import ledger commit bundles the lane's files, so this run PROBES (plans export-branch) and
    // the status read settles it — the tip-sha assertion is what proves the probe wrote nothing.
    it('B: re-running with nothing moved is a converged no-op that pushes nothing', () => {
      const shaBefore = branchTipSha(LANE);
      const laneBefore = remoteLaneFingerprint(LANE);
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> noop (converged)`);
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
      // the halt is per-lane, not per-run — and it must not leak files onto the surviving branch.
      // merge-diverged, not import-lane: lane B's tip is its import ledger commit, which bundles the
      // lane's files, and a source-bundling tip plus a moved lane takes the merge path (an import
      // would force the lane's files over whatever the bundle holds).
      expect(output).to.include(`${LANE_B} -> merge-diverged`);
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
});
