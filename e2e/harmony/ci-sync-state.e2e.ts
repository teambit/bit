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
 * bare git repo as `origin`, a file:// remote scope, no git-host credentials (PR-less path), and ONE
 * cell per reconcile run.
 */
describe('bit ci sync — state model v2', function () {
  this.timeout(0);

  let helper: Helper;
  const envGuard = createGitHostEnvGuard();
  const {
    setupSyncWorkspace,
    createLaneWithSnap,
    runBit,
    gitFetch,
    syncRun,
    seedSync,
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

  // The later cells guard the first: dev commits must still be detected on top of the newly advanced
  // state, or "converged" would just be a synonym for "blind".
  describe("a developer who snaps and exports from the branch advances the branch's own state", () => {
    const LANE = 'dev-snap';
    let defaultBranch: string;
    let devPath: string;

    before(() => {
      ({ defaultBranch } = setupSyncWorkspace({ lanes: ['*'] }));
      devPath = createLaneWithSnap(LANE, { 'comp1/index.js': comp1Src('lane-snap-1') }, 'lane snap 1');
      seedSync(LANE);
    });

    it('should read the pair as CONVERGED when the developer already did the sync, and write nothing', () => {
      gitFetch();
      helper.command.runCmd(`git checkout -f -B ${LANE} origin/${LANE}`);
      helper.fs.outputFile('comp2/index.js', comp2Src('dev-snapped-on-branch'));
      helper.command.runCmd('bit snap --message "dev snaps comp2 on the branch"');
      helper.command.runCmd('bit export');
      helper.command.runCmd('git add -A');
      helper.command.runCmd('git commit -m "feat: snap comp2 from the branch"');
      helper.command.runCmd(`git push origin ${LANE}`);
      const devCommitSha = helper.command.runCmd('git rev-parse HEAD').trim();
      helper.command.runCmd(`git checkout -f ${defaultBranch}`);
      gitFetch();
      const laneAfterDevWork = remoteLaneFingerprint(LANE);
      const branchTipAfterDevWork = branchTipSha(LANE);

      // non-vacuous: the dev commit really did move `.bitmap`, and it really is the branch tip
      const changed = helper.command.runCmd(`git show --stat --format= origin/${LANE}`);
      expect(changed, `files in the dev commit:\n${changed}`).to.include('.bitmap');
      expect(branchTipAfterDevWork).to.equal(devCommitSha);

      const { output, exitCode } = syncRun(LANE);
      // The bundled sources plan a PROBING export (the plan line names export-branch), but the snap
      // finds nothing pending and the run settles as converged with zero writes — the contract here.
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> noop (converged`);
      expect(output).to.not.include(`${LANE} -> merge-diverged`);
      expect(output).to.not.include(`${LANE} -> import-lane`);
      expect(branchTipSha(LANE)).to.equal(branchTipAfterDevWork);
      expect(remoteLaneFingerprint(LANE)).to.equal(laneAfterDevWork);
      expect(fileOnBranch(LANE, 'comp2/index.js')).to.include('dev-snapped-on-branch');
      expect(laneTipFile(devPath, 'comp2/index.js')).to.include('dev-snapped-on-branch');
    });

    it('should still export a plain dev commit made on top of that new state, then settle', () => {
      const laneBefore = remoteLaneFingerprint(LANE);
      const devCommitSha = branchSideCommit(
        LANE,
        defaultBranch,
        'comp2/index.js',
        comp2Src('plain-dev-edit-after-snap'),
        'feat: edit comp2 without snapping'
      );
      const { output, exitCode } = syncRun(LANE);
      // the developer's state commit is the baseline, not the last sync commit
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> export-branch`);
      expect(remoteLaneFingerprint(LANE)).to.not.equal(laneBefore);
      expect(laneTipFile(devPath, 'comp2/index.js')).to.include('plain-dev-edit-after-snap');
      expect(helper.command.runCmd(`git log origin/${LANE} --format=%H`)).to.include(devCommitSha);
      // the pair settles, it does not oscillate
      const tip = branchTipSha(LANE);
      const rerun = syncRun(LANE);
      expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
      expect(rerun.output).to.include(`${LANE} -> noop (converged)`);
      expect(branchTipSha(LANE)).to.equal(tip);
    });

    // The Stage-1 delta this suite once locked ("invisible round, then self-heal") is closed: the
    // probing export snaps the unsnapped edit immediately instead of declaring a blind convergence.
    it('should export an unsnapped edit riding along with a .bitmap commit, immediately', () => {
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
      const laneAfterDevWork = remoteLaneFingerprint(LANE);

      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> export-branch (lane`);
      // the probe found real pending work, so the lane moved and now carries BOTH halves of the commit
      expect(remoteLaneFingerprint(LANE)).to.not.equal(laneAfterDevWork);
      expect(laneTipFile(devPath, 'comp2/index.js')).to.include('never-snapped-edit');
      expect(laneTipFile(devPath, 'comp1/index.js')).to.include('snapped-and-exported');
    });

    it('should settle a plain non-component commit with a ledger commit, moving nothing on the lane', () => {
      const laneBefore = remoteLaneFingerprint(LANE);
      branchSideCommit(LANE, defaultBranch, 'docs/note.md', 'a plain commit\n', 'docs: an ordinary commit');
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> export-branch`);
      expect(remoteLaneFingerprint(LANE)).to.equal(laneBefore);
      expect(laneTipFile(devPath, 'comp2/index.js')).to.include('never-snapped-edit');
    });
  });

  // The bundled-commit blindness, split across TWO commits: a source edit in one commit, then a
  // `.bitmap`-touching commit that leaves the parsed state identical. The newest `.bitmap` commit
  // becomes the state commit, nothing rides above it, and a single-commit suspicion check would read
  // the pair as converged — the earlier edit would silently never reach the lane.
  describe('a source edit hidden under a later .bitmap-only commit is dev work, not convergence', () => {
    const LANE = 'split-bundle';
    let defaultBranch: string;
    let devPath: string;

    before(() => {
      ({ defaultBranch } = setupSyncWorkspace({ lanes: ['*'] }));
      devPath = createLaneWithSnap(LANE, { 'comp1/index.js': comp1Src('split-v1') }, 'split v1');
      seedSync(LANE);

      gitFetch();
      helper.command.runCmd(`git checkout -f -B ${LANE} origin/${LANE}`);
      // commit A: a real source edit, no `.bitmap` change
      helper.fs.outputFile('comp2/index.js', comp2Src('edit-under-the-bitmap-commit'));
      helper.command.runCmd('git add -A');
      helper.command.runCmd('git commit -m "feat: edit comp2"');
      // commit B: `.bitmap` touched, parsed state identical — B becomes the state commit and hides A
      fs.appendFileSync(path.join(helper.scopes.localPath, '.bitmap'), '\n');
      helper.command.runCmd('git add -A');
      helper.command.runCmd('git commit -m "chore: touch .bitmap"');
      helper.command.runCmd(`git push origin ${LANE}`);
      helper.command.runCmd(`git checkout -f ${defaultBranch}`);
    });

    it('exports the hidden edit onto the lane instead of declaring convergence', () => {
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> export-branch`);
      const onLane = laneTipFile(devPath, 'comp2/index.js');
      expect(onLane, `comp2/index.js on the lane tip:\n${onLane}`).to.include('edit-under-the-bitmap-commit');
    });

    it('a second run converges without pushing anything', () => {
      const shaBefore = branchTipSha(LANE);
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> noop (converged`);
      expect(branchTipSha(LANE)).to.equal(shaBefore);
    });
  });

  // Two independent defences: deletion requires attribution AND the marker on the tip; an unexported
  // lane pointer is not attribution at all.
  describe("a developer's own .bitmap commit must not launder a branch into deletion", () => {
    const LANE = 'launder';
    /** a developer branch whose `.bitmap` points at a lane that was never exported anywhere */
    const UNEXPORTED_BRANCH = 'never-pushed';
    let defaultBranch: string;

    before(() => {
      ({ defaultBranch } = setupSyncWorkspace({ lanes: ['*'] }));
      createLaneWithSnap(LANE, { 'comp1/index.js': comp1Src('launder-snap') }, 'launder lane snap');
      seedSync(LANE);
    });

    it('should KEEP a branch whose tip is a developer’s .bitmap commit when the lane is removed, twice', () => {
      // An unexported snap whose commit carries ONLY `.bitmap` — the marker defence in isolation. A
      // commit that bundles the source edit too reads as dev work outright (`unmerged-commits`) and is
      // covered by the bundled-commit suite in ci-sync.e2e.ts.
      gitFetch();
      helper.command.runCmd(`git checkout -f -B ${LANE} origin/${LANE}`);
      helper.fs.outputFile('comp2/index.js', comp2Src('unexported-local-snap'));
      helper.command.runCmd('bit snap --message "dev snaps comp2 but never exports it"');
      helper.command.runCmd('git add .bitmap');
      helper.command.runCmd('git commit -m "chore: record a local snap that was never exported"');
      helper.command.runCmd(`git push origin ${LANE}`);
      helper.command.runCmd(`git checkout -f ${defaultBranch}`);
      gitFetch();
      const tipBefore = branchTipSha(LANE);

      // non-vacuous: the tip really is the state commit, and it still carries the lane pointer
      const changed = helper.command.runCmd(`git show --stat --format= origin/${LANE}`);
      expect(changed, `files in the dev commit:\n${changed}`).to.include('.bitmap');
      expect(branchTipMessage(LANE)).to.not.include('[bit-sync]');
      expect(fileOnBranch(LANE, '.bitmap')).to.include('_bit_lane');

      helper.command.removeRemoteLane(LANE, '--force');
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> close-pr`);
      expect(output).to.include(`branch ${LANE} kept: its tip was not written by bit ci sync`);
      expect(output).to.not.include('branch carries unmerged commits');
      expect(remoteBranchExists(LANE), `origin/${LANE} must survive — its snap exists nowhere else`).to.be.true;
      expect(branchTipSha(LANE)).to.equal(tipBefore);
      // the .bitmap-only commit is the tip: the unexported pointer is what the guard protected
      expect(fileOnBranch(LANE, '.bitmap')).to.include('_bit_lane');

      const rerun = syncRun('--all');
      expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
      expect(rerun.output).to.include(`branch ${LANE} kept`);
      expect(remoteBranchExists(LANE)).to.be.true;
      expect(branchTipSha(LANE)).to.equal(tipBefore);
    });

    it('should ignore a branch whose .bitmap points at a never-exported lane, not read it as removed', () => {
      gitFetch();
      helper.command.runCmd(`git checkout -f -B ${UNEXPORTED_BRANCH} origin/${defaultBranch}`);
      helper.command.runCmd(`bit lane create ${UNEXPORTED_BRANCH}`);
      helper.fs.outputFile('comp1/index.js', comp1Src('work-on-a-never-pushed-lane'));
      helper.command.runCmd('git add -A');
      helper.command.runCmd('git commit -m "feat: start a lane locally, never export it"');
      helper.command.runCmd(`git push origin ${UNEXPORTED_BRANCH}`);
      const tipBefore = helper.command.runCmd('git rev-parse HEAD').trim();
      // put the workspace back the way a fresh CI checkout would find it
      helper.command.runCmd('bit switch main');
      helper.command.runCmd(`git checkout -f ${defaultBranch}`);
      gitFetch();

      // non-vacuous: the branch really does carry an UNEXPORTED lane pointer
      const bitmap = fileOnBranch(UNEXPORTED_BRANCH, '.bitmap');
      expect(bitmap).to.include('_bit_lane');
      expect(bitmap).to.include(UNEXPORTED_BRANCH);
      expect(bitmap.replace(/\s+/g, '')).to.include('"exported":false');

      const { output, exitCode } = syncRun('--all');
      expect(exitCode, `bit ci sync --all output:\n${output}`).to.equal(0);
      expect(output).to.include(`${UNEXPORTED_BRANCH} -> noop`);
      expect(output).to.not.include(`${UNEXPORTED_BRANCH} -> close-pr`);
      expect(remoteBranchExists(UNEXPORTED_BRANCH), `origin/${UNEXPORTED_BRANCH} must still exist`).to.be.true;
      expect(branchTipSha(UNEXPORTED_BRANCH)).to.equal(tipBefore);
      expect(fileOnBranch(UNEXPORTED_BRANCH, 'comp1/index.js')).to.include('work-on-a-never-pushed-lane');
    });
  });

  // The value of these cells is entirely in the `makeLocalScopeCold()` call: run the same fixtures warm
  // and they pass against broken code too (see `workspace-lane.ts`).
  describe('a cold runner (fresh clone, empty local scope) reconciles a diverged pair', () => {
    const LANE = 'cold-start';
    let defaultBranch: string;
    let devPath: string;

    before(() => {
      ({ defaultBranch } = setupSyncWorkspace({ lanes: ['*'] }));
      devPath = createLaneWithSnap(LANE, { 'comp1/index.js': comp1Src('cold-lane-snap-1') }, 'cold lane snap 1');
      seedSync(LANE);
    });

    it('should merge both sides on a scope that had never seen the lane, then converge warm', () => {
      // Diverge on DIFFERENT files, so a correct merge is conflict-free and only the cold-start
      // machinery can fail.
      laneSideEdit(devPath, 'comp1/index.js', comp1Src('cold-lane-snap-2'), 'cold lane snap 2');
      branchSideCommit(LANE, defaultBranch, 'comp2/index.js', comp2Src('cold-branch-dev'), 'feat: dev edits comp2');
      makeLocalScopeCold();
      const objectsWhenCold = scopeObjectCount();
      const bitmapOnBranch = fileOnBranch(LANE, '.bitmap');

      const { output, exitCode } = syncRun(LANE);
      // non-vacuous: the scope really was cold, and the branch really does name the lane
      expect(objectsWhenCold, 'the local scope must hold no objects at all when the run starts').to.equal(0);
      expect(bitmapOnBranch, `.bitmap on origin/${LANE}:\n${bitmapOnBranch}`).to.include(LANE);
      expect(bitmapOnBranch).to.include('_bit_lane');
      // it had to fetch everything it used, which is what "cold" costs
      expect(scopeObjectCount(), 'the run must have imported objects into the empty scope').to.be.greaterThan(0);

      // the guard must read the branch, not the scope cache
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> merge-diverged`);
      expect(output).to.not.include('HALTED');
      expect(output).to.not.include(`the branch's .bitmap points at "main"`);
      expect(output).to.include('with no conflicts');
      expect(fileOnBranch(LANE, 'comp1/index.js')).to.include('cold-lane-snap-2');
      expect(fileOnBranch(LANE, 'comp2/index.js')).to.include('cold-branch-dev');
      expect(laneTipFile(devPath, 'comp1/index.js')).to.include('cold-lane-snap-2');
      expect(laneTipFile(devPath, 'comp2/index.js')).to.include('cold-branch-dev');

      // cold and warm agree on the state
      const tip = branchTipSha(LANE);
      const rerun = syncRun(LANE);
      expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
      expect(rerun.output).to.include(`${LANE} -> noop (converged)`);
      expect(branchTipSha(LANE)).to.equal(tip);
    });

    it('should bring the lane onto the existing branch, also cold, instead of halting', () => {
      // Only the lane moves — but the branch tip is the previous merge's ledger commit, which bundles
      // sources, so the plan is merge-diverged: the merge brings the lane's edit in, and the snap
      // finds nothing of the branch's own to export.
      laneSideEdit(devPath, 'comp1/index.js', comp1Src('cold-lane-snap-3'), 'cold lane snap 3');
      makeLocalScopeCold();
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> merge-diverged`);
      expect(output).to.include('nothing new to export');
      expect(output).to.not.include('HALTED');
      expect(output).to.not.include('reported success but the workspace is on');
      expect(fileOnBranch(LANE, 'comp1/index.js')).to.include('cold-lane-snap-3');
    });

    it('should export the branch, also cold, instead of halting on a phantom failed switch', () => {
      // Only the branch moves, so the plan is export-branch: snap the dev commit onto the lane.
      const devCommitSha = branchSideCommit(
        LANE,
        defaultBranch,
        'comp2/index.js',
        comp2Src('cold-branch-dev-2'),
        'feat: comp2 again'
      );
      const tipBeforeSync = branchTipSha(LANE);
      makeLocalScopeCold();
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> export-branch`);
      expect(output).to.not.include('HALTED');
      expect(output).to.not.include('Refusing destructive recovery');
      expect(laneTipFile(devPath, 'comp2/index.js')).to.include('cold-branch-dev-2');
      expect(branchTipSha(LANE)).to.not.equal(tipBeforeSync);
      expect(branchTipMessage(LANE)).to.include('[bit-sync]');
      // never force-pushed: the developer's commit is still in the history
      expect(helper.command.runCmd(`git log origin/${LANE} --format=%H`)).to.include(devCommitSha);
    });
  });

  // The value of this cell is entirely in the `--single-branch` flag: run the same fixture off a normal
  // clone and it passes against broken code too. Shallow clones remain unsupported (a different axis:
  // missing commits, not missing refs).
  describe('a single-branch clone reconciles a lane branch its refspec never tracked', () => {
    const LANE = 'narrow-clone';
    let defaultBranch: string;
    let bareRepoPath: string;
    let devPath: string;

    before(() => {
      ({ defaultBranch, bareRepoPath } = setupSyncWorkspace({ lanes: ['*'] }));
      // Seed from a normal checkout: the lane branch must pre-exist for its absence to be observable.
      devPath = createLaneWithSnap(LANE, { 'comp1/index.js': comp1Src('narrow-snap-1') }, 'narrow snap 1');
      seedSync(LANE);
      // Move the lane on, so the narrowed run has real work to do rather than a converged no-op that
      // could pass without ever resolving `origin/<lane>`.
      laneSideEdit(devPath, 'comp1/index.js', comp1Src('narrow-snap-2'), 'narrow snap 2');
    });

    it('should converge on a remote-tracking ref the refspec omitted, populating it and carrying the move', () => {
      const clonePath = path.join(helper.scopes.e2eDir, `narrow-clone-${Date.now()}`);
      helper.command.runCmd(`git clone --single-branch --branch ${defaultBranch} ${bareRepoPath} ${clonePath}`);
      // node_modules is copied rather than installed: ref availability is what is under test.
      const modules = path.join(helper.scopes.localPath, 'node_modules');
      if (fs.existsSync(modules)) fs.copySync(modules, path.join(clonePath, 'node_modules'));
      helper.command.runCmd('bit init', clonePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, clonePath);

      // non-vacuous: the clone is really narrowed, and really cannot see the lane branch
      const configuredRefspec = helper.command.runCmd('git config --get-all remote.origin.fetch', clonePath).trim();
      const remoteTrackingBefore = helper.command.runCmd('git branch -r', clonePath);
      const laneVisibleToLsRemote = helper.command.runCmd(`git ls-remote --heads origin ${LANE}`, clonePath).trim();
      expect(configuredRefspec).to.equal(`+refs/heads/${defaultBranch}:refs/remotes/origin/${defaultBranch}`);
      expect(remoteTrackingBefore, `git branch -r in the clone:\n${remoteTrackingBefore}`).to.not.include(LANE);
      expect(laneVisibleToLsRemote, 'the remote really does have the lane branch').to.not.equal('');

      const { output, exitCode } = runBit(`bit ci sync ${LANE}`, clonePath);
      gitFetch();
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} ->`);
      expect(output).to.not.include('HALTED');
      expect(output.toLowerCase()).to.not.include('unknown revision');
      expect(output.toLowerCase()).to.not.include('ambiguous argument');
      const remoteBranches = helper.command.runCmd('git branch -r', clonePath);
      expect(remoteBranches, `git branch -r after the run:\n${remoteBranches}`).to.include(LANE);
      expect(fileOnBranch(LANE, 'comp1/index.js')).to.include('narrow-snap-2');
    });
  });

  // Exercises the import-lane path: the junk is planted BEFORE the run so it is untracked at the
  // moment `checkoutFromRemote` runs, and the startup-warning assertion keeps the cell non-vacuous.
  describe('untracked files in the workspace are discarded rather than pushed onto the branch', () => {
    const LANE = 'no-contamination';
    const JUNK_FILE = 'leftover-note.txt';
    const JUNK_DIR_FILE = 'leftover-residue/from-a-previous-lane.js';
    // the default `branchPrefix` is '', so the branch is named exactly after the lane
    const branch = LANE;

    before(() => {
      setupSyncWorkspace({ lanes: ['*'] });
      createLaneWithSnap(LANE, { 'comp1/index.js': comp1Src('contamination-guard') }, 'contamination guard');
    });

    it('should discard the planted paths from the branch and the working tree, keeping the local scope', () => {
      // Two shapes: a loose file, and a directory of the kind a halted lane leaves behind. Neither is
      // ignored and neither is under `.bit/` or `node_modules/`.
      fs.outputFileSync(path.join(helper.scopes.localPath, JUNK_FILE), 'not part of any lane state\n');
      fs.outputFileSync(path.join(helper.scopes.localPath, JUNK_DIR_FILE), 'export const stale = true;\n');

      const { output, exitCode } = syncRun(LANE);
      // non-vacuous: git really saw the planted files as uncommitted when the run started
      expect(output).to.include('uncommitted change');
      expect(output).to.include(JUNK_FILE);
      // the guard is not just a broken run, and the clean did not eat the sync itself
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} ->`);
      expect(output).to.not.include('HALTED');
      expect(fileOnBranch(branch, 'comp1/index.js')).to.include('contamination-guard');

      const tree = helper.command.runCmd(`git ls-tree -r --name-only origin/${branch}`);
      expect(branchPathsMatching(branch, 'leftover-note'), `branch tree:\n${tree}`).to.deep.equal([]);
      expect(branchPathsMatching(branch, 'leftover-residue'), `branch tree:\n${tree}`).to.deep.equal([]);
      expect(path.join(helper.scopes.localPath, JUNK_FILE)).to.not.be.a.path();
      expect(path.join(helper.scopes.localPath, JUNK_DIR_FILE)).to.not.be.a.path();
      // the clean is scoped, never -x: the local scope survives
      expect(path.join(helper.scopes.localPath, '.bit')).to.be.a.directory();
    });
  });
});
