import chai, { expect } from 'chai';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
import { armPrePushHook, comp1Src, comp2Src, createGitHostEnvGuard, syncE2eHelpers } from './ci-sync-support';
chai.use(chaiFs);

/**
 * what counts as work, and what converges. Part of the `bit ci sync` e2e suite, which is split across several files so the CI
 * splitter can spread them over parallel nodes (see scripts/split-e2e-tests.js) - one file is
 * assigned whole, so a single large one sets the floor for the entire job.
 *
 * Every scenario runs against a local bare git repo as `origin` and a file:// remote scope, with the
 * git-host env unset for the file's duration. ONE cell per reconcile run: the run is the expensive
 * part, so every facet of the same run is an expect inside that cell.
 */
describe('bit ci sync: what counts as work, and what converges', function () {
  this.timeout(0);

  let helper: Helper;
  const envGuard = createGitHostEnvGuard();
  const {
    setSyncConfig,
    setupSyncWorkspace,
    createLaneWithSnap,
    gitFetch,
    syncRun,
    seedSync,
    remoteBranchExists,
    branchTipSha,
    branchTipMessage,
    fileOnBranch,
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

  // `commitAllAndPush`'s own comment says a rejected push means "someone pushed concurrently; re-plan
  // rather than clobber" — this proves the caller actually does that instead of halting and labeling
  // the PR `bit-sync-conflict` over a race that isn't a real content conflict, AND that the pair is
  // left in a state the very next run converges cleanly — the race leaves no unresolved trail.
  describe('a rejected sync-commit push reports a benign race, not a conflict', () => {
    const LANE = 'import-race-lane';
    let devPath: string;
    let winnerPath: string;

    before(() => {
      setupSyncWorkspace({ lanes: ['*'] });
      devPath = createLaneWithSnap(LANE, { 'comp1/index.js': comp1Src('import-race-v1') }, 'v1');
      // First run: plain import-lane, no race — creates the branch and its lane pointer.
      seedSync(LANE);
      // Move the lane again so the next run touches the branch once more (merge-diverged: the branch
      // tip is the import ledger commit, which bundles the lane's files).
      laneSideEdit(devPath, 'comp1/index.js', comp1Src('import-race-v2'), 'v2');
      // A second clone of this same workspace, at this same pre-race state — the run that will win.
      winnerPath = helper.scopeHelper.cloneWorkspace();
    });

    it('reports a plain race instead of halting, and a follow-up run converges cleanly', () => {
      // Fires while our own sync-commit push is in flight — after we committed locally, before the
      // push lands. Rather than a raw ref move, this runs a SECOND, real `bit ci sync` against an
      // independent clone of this same workspace: it completes the identical import and lands its own
      // valid ledger commit on the branch first. That is the actual shape of this race (two real
      // reconciler runs), not just a rejection that happens to look like one.
      const disarm = armPrePushHook(() => helper, `cd '${winnerPath}' && ${helper.command.bitBin} ci sync ${LANE}`);
      let winnerTip: string;
      try {
        const { output, exitCode } = syncRun(LANE);
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        // The rejected push is the merge path's LEDGER commit (see the `before` note on the plan).
        expect(output).to.include(
          `${LANE} -> raced (lane updated; branch ledger commit lost the push race — next run re-plans)`
        );
        expect(output).to.not.include('HALTED');
        expect(output).to.not.include('bit-sync-conflict');
        // Anti-clobber: the surviving remote tip is the WINNER's own pushed sha, not some third value —
        // read independently from the winner's own clone. `origin/<LANE>` (not HEAD: the winner's sync
        // run restores its local checkout to the default branch once done) reflects what IT pushed,
        // since `git push` updates the local remote-tracking ref immediately, no fetch needed.
        const winnerOwnPushedSha = helper.command.runCmd(`git rev-parse origin/${LANE}`, winnerPath).trim();
        winnerTip = branchTipSha(LANE);
        expect(winnerTip, "the surviving remote tip must be the winner's own pushed commit").to.equal(
          winnerOwnPushedSha
        );
      } finally {
        disarm();
      }

      // Idempotence: with no hook armed, the next run sees the winner's already-converged state and
      // does nothing further.
      const rerun = syncRun(LANE);
      expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
      expect(rerun.output).to.include(`${LANE} -> noop (converged)`);
      expect(branchTipSha(LANE), 'the follow-up run must not have pushed anything new').to.equal(winnerTip);

      // The loser's clone stays usable: the raced run dropped its unpushed sync commit, so a later
      // BRANCH-TOUCHING run in this same clone (the lane moves again -> merge-diverged) checks the
      // branch out cleanly instead of tripping the pristine-checkout orphan guard and halting.
      laneSideEdit(devPath, 'comp1/index.js', comp1Src('import-race-v3'), 'v3');
      const reuse = syncRun(LANE);
      expect(reuse.exitCode, `bit ci sync output:\n${reuse.output}`).to.equal(0);
      expect(reuse.output).to.include(`${LANE} -> merge-diverged`);
      expect(reuse.output).to.not.include('HALTED');
    });
  });

  // A single commit that bundles a source edit WITH a `.bitmap` write is the state commit itself, so
  // "commits after the state commit" counts zero — the edit used to be invisible and the pair read as
  // converged while the lane never received it. The conflict-halt comment's resolve-by-hand recipe
  // (bit lane import + fix + one commit) produces exactly this shape.

  // A single commit that bundles a source edit WITH a `.bitmap` write is the state commit itself, so
  // "commits after the state commit" counts zero — the edit used to be invisible and the pair read as
  // converged while the lane never received it. The conflict-halt comment's resolve-by-hand recipe
  // (bit lane import + fix + one commit) produces exactly this shape.
  describe('a commit bundling a source edit with a .bitmap write is dev work, not convergence', () => {
    const LANE = 'bundled-commit';
    let defaultBranch: string;
    let devPath: string;

    before(() => {
      ({ defaultBranch } = setupSyncWorkspace({ lanes: ['*'] }));
      devPath = createLaneWithSnap(LANE, { 'comp1/index.js': comp1Src('bundled-v1') }, 'bundled v1');
      // First sync materializes the branch and converges the pair.
      const seed = syncRun(LANE);
      expect(seed.exitCode, `bit ci sync output:\n${seed.output}`).to.equal(0);
      expect(seed.output).to.include(`${LANE} -> import-lane`);

      // The human's bundled commit: a real source edit riding in the same commit as a `.bitmap` write
      // that leaves the parsed state identical (so the fingerprints still read converged).
      gitFetch();
      helper.command.runCmd(`git checkout -f -B ${LANE} origin/${LANE}`);
      helper.fs.outputFile('comp1/index.js', comp1Src('bundled-by-hand'));
      const bitmapPath = path.join(helper.scopes.localPath, '.bitmap');
      fs.appendFileSync(bitmapPath, '\n');
      helper.command.runCmd('git add -A');
      helper.command.runCmd('git commit -m "fix: hand-resolved content riding with a .bitmap write"');
      helper.command.runCmd(`git push origin ${LANE}`);
      helper.command.runCmd(`git checkout -f ${defaultBranch}`);
    });

    it('exports the bundled edit onto the lane instead of declaring convergence', () => {
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> export-branch`);
      expect(output).to.not.include('noop (converged)');
      expect(laneTipFile(devPath, 'comp1/index.js')).to.include('bundled-by-hand');
    });

    it('a second run reads the truly converged pair as converged', () => {
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> noop (converged)`);
    });
  });

  // `commitTouchesBeyondBitmap` asks "any path other than `.bitmap`", so a file no component tracks
  // plans the probe too. The probe is a status READ: finding nothing pending it settles as converged
  // and writes NOTHING — no ledger commit, no push, no CI re-trigger. The suspicion re-plans the probe
  // on every later run, and every one of them is equally free of writes; the tip-sha assertions are
  // what prove that.

  // `commitTouchesBeyondBitmap` asks "any path other than `.bitmap`", so a file no component tracks
  // plans the probe too. The probe is a status READ: finding nothing pending it settles as converged
  // and writes NOTHING — no ledger commit, no push, no CI re-trigger. The suspicion re-plans the probe
  // on every later run, and every one of them is equally free of writes; the tip-sha assertions are
  // what prove that.
  describe('a probe that finds nothing pending settles without writing anything', () => {
    const LANE = 'clean-probe';
    let defaultBranch: string;
    let devTipSha: string;

    before(() => {
      ({ defaultBranch } = setupSyncWorkspace({ lanes: ['*'] }));
      createLaneWithSnap(LANE, { 'comp1/index.js': comp1Src('clean-probe-v1') }, 'clean probe v1');
      const seed = syncRun(LANE);
      expect(seed.exitCode, `bit ci sync output:\n${seed.output}`).to.equal(0);

      // A file no component tracks, riding in the same commit as a `.bitmap` write — the shape that
      // reads exactly like the bundled-source case above and is indistinguishable from it by name.
      gitFetch();
      helper.command.runCmd(`git checkout -f -B ${LANE} origin/${LANE}`);
      helper.fs.outputFile('docs/notes.md', 'a note no component tracks\n');
      fs.appendFileSync(path.join(helper.scopes.localPath, '.bitmap'), '\n');
      helper.command.runCmd('git add -A');
      helper.command.runCmd('git commit -m "docs: a note riding with a .bitmap write"');
      helper.command.runCmd(`git push origin ${LANE}`);
      helper.command.runCmd(`git checkout -f ${defaultBranch}`);
      devTipSha = branchTipSha(LANE);
    });

    it('exports nothing and pushes nothing — the developer commit stays the tip', () => {
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> noop (converged)`);
      expect(branchTipSha(LANE)).to.equal(devTipSha);
    });

    it('the repeat probe is just as write-free', () => {
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> noop (converged)`);
      expect(branchTipSha(LANE)).to.equal(devTipSha);
    });
  });

  // A squash rewrite builds the squashed commit's body by concatenating the squashed commits' messages
  // (GitHub's squash-merge does exactly this) — and a synced branch's history is full of ledger messages
  // ending in `[bit-sync]` on its own line. The result is a developer's commit wearing the reconciler's
  // signature; reading it as ours would declare convergence over content the lane never received.

  // A squash rewrite builds the squashed commit's body by concatenating the squashed commits' messages
  // (GitHub's squash-merge does exactly this) — and a synced branch's history is full of ledger messages
  // ending in `[bit-sync]` on its own line. The result is a developer's commit wearing the reconciler's
  // signature; reading it as ours would declare convergence over content the lane never received.
  describe('a squash commit whose body quotes the sync marker is dev work, not convergence', () => {
    const LANE = 'squash-marker';
    let defaultBranch: string;
    let devPath: string;

    before(() => {
      ({ defaultBranch } = setupSyncWorkspace({ lanes: ['*'] }));
      devPath = createLaneWithSnap(LANE, { 'comp1/index.js': comp1Src('squash-v1') }, 'squash v1');
      const seed = syncRun(LANE);
      expect(seed.exitCode, `bit ci sync output:\n${seed.output}`).to.equal(0);
      expect(seed.output).to.include(`${LANE} -> import-lane`);

      // Squash the whole branch into ONE commit that also carries a NEW source edit, with the body
      // shaped the way a squash-merge shapes it: the concatenated messages include a full ledger
      // message, trailer and marker included.
      gitFetch();
      helper.command.runCmd(`git checkout -f -B ${LANE} origin/${LANE}`);
      helper.fs.outputFile('comp1/index.js', comp1Src('squash-era-work'));
      helper.command.runCmd(`git reset --soft $(git merge-base origin/${defaultBranch} HEAD)`);
      const messagePath = path.join(helper.scopes.localPath, '..', `${LANE}-squash-msg.txt`);
      fs.outputFileSync(
        messagePath,
        [
          'feat: the squash-era work (#42)',
          '',
          '* fix: work on comp1',
          '',
          `* chore(bit-sync): sync lane org.scope/${LANE} @ 123abc456`,
          '',
          'Bit-Lane-Head: 4e1243bd22c66e76c2ba9eddc1f91394e57f9f83',
          '[bit-sync]',
          '',
        ].join('\n')
      );
      helper.command.runCmd('git add -A');
      helper.command.runCmd(`git commit -F "${messagePath}"`);
      helper.command.runCmd(`git push -f origin ${LANE}`);
      helper.command.runCmd(`git checkout -f ${defaultBranch}`);
    });

    it('exports the squashed work onto the lane instead of declaring convergence', () => {
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> export-branch`);
      const onLane = laneTipFile(devPath, 'comp1/index.js');
      expect(onLane, `comp1/index.js on the lane tip:\n${onLane}`).to.include('squash-era-work');
    });

    it('a second run converges without pushing anything to the branch', () => {
      const shaBefore = branchTipSha(LANE);
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> noop (converged`);
      expect(branchTipSha(LANE)).to.equal(shaBefore);
    });
  });

  // The cross-scope split: foreign CONTENT is refused outright; a foreign HOST is fine as long as the
  // content is this repo's, addressed by its scope-qualified id.

  // A branch commit that touches no bit-tracked file (docs, CI config) keeps `hasDevCommits` true
  // forever — `stateCommit` (sync-state.ts, derived from `.bitmap`'s content, never commit messages)
  // cannot advance past it. So export-branch is re-planned on every run, and what keeps that from
  // looping is that the probe is a READ: finding nothing to push it writes nothing, so no ledger
  // commit lands on the branch and no CI run is re-triggered.
  describe('a commit that touches no bit-tracked file probes without writing, run after run', () => {
    const LANE = 'docs-only-lane';
    let defaultBranch: string;
    let devPath: string;
    let docsTipSha: string;

    before(() => {
      ({ defaultBranch } = setupSyncWorkspace({ lanes: ['*'] }));
      devPath = createLaneWithSnap(LANE, { 'comp1/index.js': comp1Src('lane-snap-1') }, 'lane snap 1');
      seedSync(LANE);
      branchSideCommit(LANE, defaultBranch, 'NOTES.md', '# notes\n', 'docs: add notes');
      docsTipSha = branchTipSha(LANE);
    });

    it('finds nothing to export and pushes nothing — twice, the docs commit staying the tip', () => {
      const first = syncRun(LANE);
      expect(first.exitCode, `bit ci sync output:\n${first.output}`).to.equal(0);
      expect(first.output).to.include(`${LANE} -> export-branch`);
      expect(first.output).to.include(`${LANE} -> noop (converged)`);
      expect(branchTipSha(LANE)).to.equal(docsTipSha);

      const second = syncRun(LANE);
      expect(second.exitCode, `bit ci sync output:\n${second.output}`).to.equal(0);
      expect(second.output).to.include(`${LANE} -> noop (converged)`);
      expect(branchTipSha(LANE)).to.equal(docsTipSha);
    });

    // The probe settles; it does not trap. A real dev commit on top must still export normally.
    it('a real dev commit on top of the settled tip exports again', () => {
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
      expect(laneTipFile(devPath, 'comp1/index.js')).to.include('dev-commit-after-settle');
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

  // A branch commit that touches no bit-tracked file (docs, CI config) keeps `hasDevCommits` true
  // forever — `stateCommit` (sync-state.ts, derived from `.bitmap`'s content, never commit messages)
  // cannot advance past it. So export-branch is re-planned on every run, and what keeps that from
  // looping is that the probe is a READ: finding nothing to push it writes nothing, so no ledger
  // commit lands on the branch and no CI run is re-triggered.
});
