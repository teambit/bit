import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
import { armPrePushHook, comp1Src, comp2Src, createGitHostEnvGuard, syncE2eHelpers } from './ci-sync-support';
chai.use(chaiFs);

/**
 * branch ownership and first contact. Part of the `bit ci sync` e2e suite, which is split across several files so the CI
 * splitter can spread them over parallel nodes (see scripts/split-e2e-tests.js) - one file is
 * assigned whole, so a single large one sets the floor for the entire job.
 *
 * Every scenario runs against a local bare git repo as `origin` and a file:// remote scope, with the
 * git-host env unset for the file's duration. ONE cell per reconcile run: the run is the expensive
 * part, so every facet of the same run is an expect inside that cell.
 */
describe('bit ci sync: branch ownership and first contact', function () {
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
    fileOnBranch,
    remoteLaneFingerprint,
    laneTipFile,
    branchSideCommit,
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

  // Every input to the deletion decision is read from refs fetched once at the start of the run, so a
  // branch can advance before the delete lands. A `pre-push` hook is the only way to interleave a remote
  // update into the command's own push, i.e. to reach the window between the re-read and the delete.
  describe('a branch that advances between the ownership read and the delete is kept, not deleted', () => {
    const LANE = 'race-lane';
    let defaultBranch: string;
    let bareRepoPath: string;

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
    });

    it('should keep the branch, name the race, and leave the racing commit as the tip', () => {
      const racedTo = branchTipSha(defaultBranch);
      // Runs while the delete push is in flight — after the command re-read the tip, before it lands.
      const disarm = armPrePushHook(
        () => helper,
        `git --git-dir='${bareRepoPath}' update-ref refs/heads/${LANE} ${racedTo}`
      );
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
        disarm();
      }
    });
  });

  // The defect this closes: `bit ci pr --keep-lane` creates the lane but never commits the pointer to
  // the branch's `.bitmap`, and the next `bit ci sync` used to halt on the pair.

  // The defect this closes: `bit ci pr --keep-lane` creates the lane but never commits the pointer to
  // the branch's `.bitmap`, and the next `bit ci sync` used to halt on the pair.
  describe('a branch adopted into an existing lane on first contact (bit ci pr --keep-lane, then sync)', () => {
    const FEATURE_BRANCH = 'adopt-feature';
    let defaultBranch: string;
    let devPath: string;

    before(() => {
      ({ defaultBranch } = setupSyncWorkspace({ lanes: ['*'] }));
      // A plain git-native branch — no bit lane involved yet.
      helper.command.runCmd(`git checkout -b ${FEATURE_BRANCH}`);
      helper.fs.outputFile('comp1/index.js', comp1Src('adopt-feature-v1'));
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "feat: adopt-feature work"');
      helper.command.runCmd(`git push -u origin ${FEATURE_BRANCH}`);

      // Creates the cloud lane from this branch's content without committing the pointer back to it.
      helper.command.runCmd('bit ci pr --keep-lane --message "adopt via keep-lane"');
      helper.command.runCmd(`git checkout -f ${defaultBranch}`);
      // An independent clone on the lane, to read the LANE's own content rather than the branch's mirror.
      devPath = helper.scopeHelper.cloneWorkspace();
      helper.command.runCmd(`bit switch ${helper.scopes.remote}/${FEATURE_BRANCH} --get-all`, devPath);
    });

    it('starts with no lane pointer at all on the branch — the exact pre-adoption shape', () => {
      expect(fileOnBranch(FEATURE_BRANCH, '.bitmap')).to.not.include('"_bit_lane"');
    });

    it('adopts the branch instead of halting, and writes the lane pointer to it', () => {
      const { output, exitCode } = syncRun(FEATURE_BRANCH);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${FEATURE_BRANCH} -> adopt-branch`);
      expect(output).to.not.include('HALTED');
      const bitmapAtTip = fileOnBranch(FEATURE_BRANCH, '.bitmap');
      expect(bitmapAtTip).to.include('"_bit_lane"');
      // Not just the branch's pointer — the LANE itself carries the adopted content.
      expect(laneTipFile(devPath, 'comp1/index.js')).to.include('adopt-feature-v1');
    });

    it('a second run sees the pair as converged and does nothing further', () => {
      const { output, exitCode } = syncRun(FEATURE_BRANCH);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${FEATURE_BRANCH} -> noop (converged)`);
    });
  });

  // Adoption must never be a bare export: real divergence halts and the lane is left untouched.

  // Adoption must never be a bare export: real divergence halts and the lane is left untouched.
  describe('a branch whose content would change the lane at first contact halts instead of adopting', () => {
    const FEATURE_BRANCH = 'adopt-conflict';
    let defaultBranch: string;
    let devPath: string;
    let laneFingerprintBeforeRun: string;

    before(() => {
      ({ defaultBranch } = setupSyncWorkspace({ lanes: ['*'] }));
      helper.command.runCmd(`git checkout -b ${FEATURE_BRANCH}`);
      helper.fs.outputFile('comp1/index.js', comp1Src('adopt-conflict-v1'));
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "feat: adopt-conflict work"');
      helper.command.runCmd(`git push -u origin ${FEATURE_BRANCH}`);

      // Creates the cloud lane from the branch's v1 content, same as the adoption test above.
      helper.command.runCmd('bit ci pr --keep-lane --message "adopt via keep-lane"');

      // A second commit lands without another `ci pr` run: the lane holds v1, the branch v2.
      helper.fs.outputFile('comp1/index.js', comp1Src('adopt-conflict-v2'));
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "feat: adopt-conflict v2, never re-synced"');
      helper.command.runCmd(`git push origin ${FEATURE_BRANCH}`);
      helper.command.runCmd(`git checkout -f ${defaultBranch}`);

      devPath = helper.scopeHelper.cloneWorkspace();
      helper.command.runCmd(`bit switch ${helper.scopes.remote}/${FEATURE_BRANCH} --get-all`, devPath);
      laneFingerprintBeforeRun = remoteLaneFingerprint(FEATURE_BRANCH);
    });

    it('halts instead of adopting, and leaves the lane content untouched', () => {
      const { output, exitCode } = syncRun(FEATURE_BRANCH);
      expect(exitCode, `bit ci sync output:\n${output}`).to.not.equal(0);
      expect(output).to.include('HALTED');
      expect(output).to.include('cannot tell which side is newer');
      expect(output).to.include('adopting would change');
      // Nothing was exported: the lane's content is exactly what it was before this run.
      expect(remoteLaneFingerprint(FEATURE_BRANCH)).to.equal(laneFingerprintBeforeRun);
      expect(laneTipFile(devPath, 'comp1/index.js')).to.include('adopt-conflict-v1');
    });

    // A snap-based probe would grow the local scope on every attempt; the status-based decision never snaps.
    it('leaves the local scope byte-clean — a repeat halt attempt creates no additional objects', () => {
      const afterFirstHalt = scopeObjectCount();
      const { output, exitCode } = syncRun(FEATURE_BRANCH);
      expect(exitCode, `bit ci sync output:\n${output}`).to.not.equal(0);
      expect(output).to.include('HALTED');
      expect(scopeObjectCount(), 'a residue-free halt must not grow the local scope on a repeat attempt').to.equal(
        afterFirstHalt
      );
    });
  });

  // Lane names chosen so the halting lane sorts first: any adoption residue would poison the lane after it.

  // Lane names chosen so the halting lane sorts first: any adoption residue would poison the lane after it.
  describe('one lane halting during adoption does not affect a healthy lane in the same --all run', () => {
    const HALTING_LANE = 'adopt-conflict-blast';
    const HEALTHY_LANE = 'healthy-blast';
    let defaultBranch: string;

    before(() => {
      ({ defaultBranch } = setupSyncWorkspace({ lanes: ['*'] }));

      helper.command.runCmd(`git checkout -b ${HALTING_LANE}`);
      helper.fs.outputFile('comp1/index.js', comp1Src('blast-v1'));
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "feat: blast work"');
      helper.command.runCmd(`git push -u origin ${HALTING_LANE}`);
      helper.command.runCmd('bit ci pr --keep-lane --message "adopt via keep-lane"');
      helper.fs.outputFile('comp1/index.js', comp1Src('blast-v2'));
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "feat: blast v2, never re-synced"');
      helper.command.runCmd(`git push origin ${HALTING_LANE}`);
      helper.command.runCmd(`git checkout -f ${defaultBranch}`);

      // The healthy lane: created and moved independently — an ordinary import-lane target.
      createLaneWithSnap(HEALTHY_LANE, { 'comp2/index.js': comp2Src('healthy-v1') }, 'healthy v1');
    });

    it('the healthy lane converges and the halting one is left untouched, in the same run', () => {
      const { output, exitCode } = syncRun('--all');
      expect(exitCode, `bit ci sync output:\n${output}`).to.not.equal(0);
      expect(output).to.include(`HALTED ${HALTING_LANE}`);
      expect(output).to.include('adopting would change');
      expect(output).to.include(`${HEALTHY_LANE} -> import-lane`);
      expect(fileOnBranch(HEALTHY_LANE, 'comp2/index.js')).to.include('healthy-v1');
    });

    it('a follow-up targeted run confirms the healthy lane converged cleanly — no residue tripped it', () => {
      const rerun = syncRun(HEALTHY_LANE);
      expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
      expect(rerun.output).to.include(`${HEALTHY_LANE} -> noop (converged)`);
    });
  });

  // `commitAllAndPush`'s own comment says a rejected push means "someone pushed concurrently; re-plan
  // rather than clobber" — this proves the caller actually does that instead of halting and labeling
  // the PR `bit-sync-conflict` over a race that isn't a real content conflict, AND that the pair is
  // left in a state the very next run converges cleanly — the race leaves no unresolved trail.
});
