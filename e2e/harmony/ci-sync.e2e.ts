import chai, { expect } from 'chai';
import execa from 'execa';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Helper } from '@teambit/legacy.e2e-helper';
import { removeChalkCharacters } from '@teambit/legacy.utils';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

/**
 * e2e coverage for `bit ci sync` — the stateless lane <-> branch/PR reconciler.
 *
 * Every scenario runs against a *local bare git repo* as `origin` and a file:// remote scope, with no
 * git-host credentials in the environment. That is deliberate: it exercises the PR-less path (the git
 * half of the sync runs, PR operations are logged and skipped), which is the half these tests can
 * assert on without a network. The suite unsets `GITHUB_TOKEN`/`BIT_GITHUB_TOKEN`/`GITHUB_REPOSITORY`
 * for its whole duration so a developer's shell environment can't silently turn these runs into
 * PR-creating ones (and make them fail against a real repository).
 *
 * The assertions are deliberately about *file content on the pushed branch and on the lane tip*, not
 * just about commits existing. Two bugs found during implementation were invisible to
 * commit-existence checks:
 *   - `switchToLane`'s `forceOurs: true` default made the import direction a `.bitmap`-only commit
 *     carrying a `Bit-Lane-Head` trailer that claimed the branch mirrored the lane (it didn't).
 *   - the diverged path used to snap *before* merging, so the lane tip silently reverted every
 *     lane-side file edit to the branch's content.
 * Scenarios A and D1 lock those two respectively, by asserting on real file bytes.
 */
describe('bit ci sync', function () {
  this.timeout(0);
  let helper: Helper;

  /** env keys that would flip the run out of the PR-less path we assert on */
  const GIT_HOST_ENV_KEYS = ['GITHUB_TOKEN', 'BIT_GITHUB_TOKEN', 'GITHUB_REPOSITORY', 'GITHUB_HEAD_REF'];
  const savedEnv: Record<string, string | undefined> = {};

  /**
   * The console warning `selectGitHostProvider` produces when the built-in github provider is
   * registered but has no credentials and doesn't claim the (local, bare) remote. Asserting on it is
   * what proves these runs really took the PR-less path rather than quietly finding a token.
   */
  const NO_GIT_HOST_WARNING = 'no git host provider is configured';

  before(() => {
    GIT_HOST_ENV_KEYS.forEach((key) => {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    });
    helper = new Helper();
  });

  after(() => {
    GIT_HOST_ENV_KEYS.forEach((key) => {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    });
    helper.scopeHelper.destroy();
  });

  // ---------------------------------------------------------------------------------------------
  // shared setup idioms (same as e2e/harmony/ci-commands.e2e.ts)
  // ---------------------------------------------------------------------------------------------

  function setupGitRemote() {
    // Create a bare git repository to serve as remote
    const { scopePath } = helper.scopeHelper.getNewBareScope();
    const bareRepoPath = scopePath.replace('.bit', '.git');
    helper.command.runCmd(`git init --bare ${bareRepoPath}`);

    // Initialize git in workspace and set up remote
    helper.git.initNewGitRepo(true);
    helper.command.runCmd(`git remote add origin ${bareRepoPath}`);

    return bareRepoPath;
  }

  /**
   * Two components with NO dependency between them. `populateComponents` chains comp1 -> comp2, which
   * would drag comp2 into every snap of comp1 (auto-tag) and make "which side moved which component"
   * — the whole subject of these tests — ambiguous.
   */
  const comp1Src = (marker: string) => `module.exports = () => 'comp1: ${marker}';\n`;
  const comp2Src = (marker: string) => `module.exports = () => 'comp2: ${marker}';\n`;

  function setupComponentsAndInitialCommit() {
    helper.fs.outputFile('comp1/index.js', comp1Src('initial'));
    helper.fs.outputFile('comp2/index.js', comp2Src('initial'));
    helper.command.addComponent('comp1');
    helper.command.addComponent('comp2');
    helper.command.tagAllWithoutBuild();
    helper.command.export();

    helper.fs.outputFile('.gitignore', 'node_modules/\n.bit/\n');
    helper.command.runCmd('git add .');
    helper.command.runCmd('git commit -m "initial commit"');
    const currentBranch = helper.command.runCmd('git branch --show-current').trim();
    helper.command.runCmd(`git push -u origin ${currentBranch}`);
    return currentBranch;
  }

  /** the reconciler's config lives on the ci aspect in workspace.jsonc */
  function setSyncConfig(sync: Record<string, any> = {}) {
    helper.workspaceJsonc.addKeyVal('teambit.git/ci', { sync });
  }

  // ---------------------------------------------------------------------------------------------
  // runners / readers
  // ---------------------------------------------------------------------------------------------

  /**
   * Run a bit command capturing stdout, stderr AND the exit code. `helper.command.runCmd` throws on a
   * non-zero exit and only returns stdout, but `bit ci sync` reports halts by exiting non-zero with the
   * summary on stderr — both halves are load-bearing assertions here.
   */
  function runBit(cmd: string, cwd: string = helper.scopes.localPath): { output: string; exitCode: number } {
    const full = cmd.startsWith('bit ') ? `${helper.command.bitBin} ${cmd.slice(4)}` : cmd;
    const res = execa.sync(full, { cwd, shell: true, reject: false });
    const combined = `${res.stdout || ''}\n${res.stderr || ''}`;
    return { output: (removeChalkCharacters(combined) as string) || '', exitCode: res.exitCode ?? -1 };
  }

  function gitFetch() {
    helper.command.runCmd('git fetch origin --prune');
  }

  function remoteBranchExists(branch: string): boolean {
    return helper.command.runCmd(`git ls-remote --heads origin ${branch}`).trim().length > 0;
  }

  function remoteRefs(): string {
    return helper.command.runCmd('git ls-remote origin').trim();
  }

  function branchTipSha(branch: string): string {
    return helper.command.runCmd(`git rev-parse origin/${branch}`).trim();
  }

  function branchTipMessage(branch: string): string {
    return helper.command.runCmd(`git log origin/${branch} -1 --format=%B`);
  }

  function laneHeadTrailer(branch: string): string | undefined {
    return branchTipMessage(branch).match(/^Bit-Lane-Head:\s*(\S+)/m)?.[1];
  }

  /** file content as committed on the remote branch (not as it happens to sit in the working tree) */
  function fileOnBranch(branch: string, filePath: string): string {
    return helper.command.runCmd(`git show origin/${branch}:${filePath}`);
  }

  /**
   * The paths on the remote branch's tree whose *name* contains `needle`.
   *
   * Path-agnostic on purpose: when the reconciler materializes a lane component this workspace never
   * had, bit picks the directory for it from the workspace's `defaultDirectory` — not from wherever the
   * lane author happened to put it. So "is this component on the branch?" cannot be asked with a hard
   * coded path, only by looking at the tree. Matching on the path (not the content) keeps `.bitmap`,
   * which names every component, out of the answer.
   */
  function branchPathsMatching(branch: string, needle: string): string[] {
    return helper.command
      .runCmd(`git ls-tree -r --name-only origin/${branch}`)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line.includes(needle));
  }

  /**
   * A content fingerprint of the remote lane: the per-component heads. Used to assert "the lane moved"
   * / "the lane did NOT move" without depending on the lane object's (randomly minted) hash.
   */
  function remoteLaneFingerprint(laneName: string): string {
    const parsed = helper.command.listRemoteLanesParsed();
    const lane = parsed.lanes.find((l: any) => (l.id?.name ?? l.name) === laneName);
    return lane ? JSON.stringify(lane.components) : 'LANE-MISSING';
  }

  /**
   * Bring a "developer" workspace up to the lane tip and return one of its files — i.e. read the
   * lane's own content, as opposed to the branch's mirror of it.
   */
  function laneTipFile(devPath: string, filePath: string): string {
    helper.command.runCmd('bit fetch --lanes', devPath);
    helper.command.runCmd('bit checkout head -x', devPath);
    return fs.readFileSync(path.join(devPath, filePath)).toString();
  }

  /** Move the lane forward from a "developer" workspace: edit a file, snap, export. */
  function laneSideEdit(devPath: string, filePath: string, content: string, message: string) {
    helper.command.runCmd('bit fetch --lanes', devPath);
    helper.command.runCmd('bit checkout head -x', devPath);
    fs.outputFileSync(path.join(devPath, filePath), content);
    helper.command.runCmd(`bit snap --message "${message}"`, devPath);
    helper.command.runCmd('bit export', devPath);
  }

  /**
   * Move the branch forward the way a developer would: commit onto the *branch* in the CI workspace
   * and push, then put the checkout back on the default branch so the next `bit ci sync` starts from
   * the same place a fresh CI clone would. Returns the pushed sha.
   */
  function branchSideCommit(
    branch: string,
    defaultBranch: string,
    filePath: string,
    content: string,
    message: string
  ): string {
    gitFetch();
    helper.command.runCmd(`git checkout -f -B ${branch} origin/${branch}`);
    helper.fs.outputFile(filePath, content);
    helper.command.runCmd('git add -A');
    helper.command.runCmd(`git commit -m "${message}"`);
    helper.command.runCmd(`git push origin ${branch}`);
    const sha = helper.command.runCmd('git rev-parse HEAD').trim();
    helper.command.runCmd(`git checkout -f ${defaultBranch}`);
    return sha;
  }

  // =============================================================================================
  // Scenarios A, B, C, D1, D2 and the lane-deleted path all describe *successive states of the same
  // lane/branch pair*, so they share one workspace and run in order. That is not just a speed
  // optimization: the reconciler is stateless, and the only way to prove that is to drive one pair
  // through a whole lifecycle and assert at each step.
  // =============================================================================================
  describe('lane <-> branch reconcile cycle (scenarios A, B, C, D1, D2, lane-deleted)', () => {
    const LANE = 'sync-cycle';
    let defaultBranch: string;
    let devPath: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      setSyncConfig({ lanes: ['*'] });
      defaultBranch = setupComponentsAndInitialCommit();

      // A second workspace sharing the same remote scope and the same bare git repo — the
      // "developer on bit.cloud" whose lane the reconciler mirrors.
      devPath = helper.scopeHelper.cloneWorkspace();
      helper.command.runCmd(`bit lane create ${LANE}`, devPath);
      fs.outputFileSync(path.join(devPath, 'comp1', 'index.js'), comp1Src('lane-snap-1'));
      helper.command.runCmd('bit snap --message "lane snap 1"', devPath);
      helper.command.runCmd('bit export', devPath);
    });

    // -------------------------------------------------------------------------------------------
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
        // Locks the environment these tests assert against. A bare local remote is claimed by nobody,
        // and no provider holds credentials, so the run degrades to git-only and says so.
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

      /**
       * THE materialization lock. `switchToLane` defaults to `forceOurs: true`, under which
       * `applyVersion` marks every file `unchanged` and only moves `.bitmap` — producing a commit whose
       * `Bit-Lane-Head` trailer asserts the branch mirrors the lane while the files still hold the
       * default branch's content. Asserting on the trailer or on the commit's existence cannot see that;
       * asserting on the file bytes can.
       */
      it("should put the LANE's file content in the branch's tree, not just a .bitmap bump", () => {
        const onBranch = fileOnBranch(LANE, 'comp1/index.js');
        expect(onBranch, `comp1/index.js on origin/${LANE}:\n${onBranch}`).to.include('lane-snap-1');
        expect(onBranch).to.not.include('comp1: initial');
        // non-vacuous: the default branch (the branch's fork point) still holds the pre-lane content,
        // so 'lane-snap-1' can only have come from materializing the lane.
        expect(fileOnBranch(defaultBranch, 'comp1/index.js')).to.include('comp1: initial');
      });

      it('should commit the lane pointer in .bitmap so later runs can merge into the branch', () => {
        // `executeMergeDiverged` refuses to run unless the branch's committed `.bitmap` says the
        // workspace is on the lane — without this the diverged path can never fire.
        expect(fileOnBranch(LANE, '.bitmap')).to.include(LANE);
      });

      it('should leave the workspace restored: git on the default branch, bit on main', () => {
        expect(helper.command.runCmd('git branch --show-current').trim()).to.equal(defaultBranch);
        expect(helper.command.listLanesParsed().currentLane).to.equal('main');
      });
    });

    // -------------------------------------------------------------------------------------------
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

    // -------------------------------------------------------------------------------------------
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

    // -------------------------------------------------------------------------------------------
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

      /**
       * THE merge-first lock. The diverged path used to snap the branch's tree onto the lane and only
       * then merge; because `snapPrCommit`'s switch uses `forceOurs`, that snap recorded the *branch's*
       * files against the new lane head — silently reverting the lane-side edit on the lane tip while
       * pushing a trailer asserting the two sides had converged.
       */
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

    // -------------------------------------------------------------------------------------------
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
        // With a git host the halt labels the PR `bit-sync-conflict` (which the planner then treats as
        // a hard no-op) and comments the resolution steps. PR-less, that is announced and skipped —
        // this is the observable trace of that path.
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

    // -------------------------------------------------------------------------------------------
    describe('lane removed from the remote -> close-pr retires the branch', () => {
      let output: string;
      let exitCode: number;
      before(() => {
        // --force: the lane carries snaps that were never merged into main, which is the whole point
        // of a lane the reconciler was mirroring. Without it `bit lane remove --remote` refuses.
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

      it('should delete the branch from the git remote', () => {
        expect(output).to.include(`branch ${LANE} deleted`);
        expect(remoteBranchExists(LANE)).to.be.false;
      });

      describe('re-running once both sides are gone', () => {
        let rerun: { output: string; exitCode: number };
        before(() => {
          rerun = runBit(`bit ci sync ${LANE}`);
        });
        it('should be a no-op', () => {
          expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
          expect(rerun.output).to.include('lane and branch both absent');
        });
      });
    });
  });

  // =============================================================================================
  // Scenario F (dry-run writes nothing to the remote) and scenario E (main-scope drift -> sync PR
  // branch) share a workspace: F must observe pristine remote refs *while drift exists*, which is
  // exactly the state E needs before it runs. F therefore runs first, and E right after it.
  // =============================================================================================
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

      // AND, on the default branch of the repository, a source change that was never exported to bit.
      // comp1 is therefore *modified* relative to its `.bitmap` version AND its head moved in the
      // scope — the exact state that makes `bit checkout head` compute a real three-way merge and,
      // without `mergeStrategy: 'theirs'`, throw `please use "--auto-merge-resolve"` and halt the run.
      helper.fs.outputFile('comp1/index.js', comp1Src('unexported-git-drift'));
      helper.command.runCmd('git add -A');
      helper.command.runCmd('git commit -m "chore: source drift that was never exported"');
      helper.command.runCmd(`git push origin ${defaultBranch}`);
      gitFetch();
    });

    // -------------------------------------------------------------------------------------------
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

    // -------------------------------------------------------------------------------------------
    describe('scenario E: --main pushes the drift onto the sync branch', () => {
      let output: string;
      let exitCode: number;
      before(() => {
        ({ output, exitCode } = runBit('bit ci sync --main'));
        gitFetch();
      });

      it('should NOT halt despite unexported source drift on the default branch', () => {
        // The 'theirs' resolution. Without it, `checkout head` throws
        // `automatic merge has failed … please use "--auto-merge-resolve"` and the run exits non-zero
        // pointing at a flag `bit ci sync` does not have.
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
        // non-vacuous: the default branch still holds the drift, so this branch's content is a result
        // of the sync, not of the checkout it forked from.
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

    // -------------------------------------------------------------------------------------------
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

  // =============================================================================================
  // Two lanes in ONE `--all` run. Three properties live only at the loop level — a single-lane run
  // cannot express any of them — and each one was a real defect:
  //
  //   1. **A deleted lane is still visited.** `--all` used to enumerate only the lanes that exist on
  //      the remote. A lane merged/archived/deleted on bit.cloud is by definition *not* in that list, so
  //      its branch was never visited and `close-pr` could never fire for the one state it exists for:
  //      every merged lane left an orphan branch and an open PR behind, forever. The enumeration is now
  //      the union of the remote's lanes and the lane-mapped branches on `origin`.
  //   2. **One halted lane must not abort the lanes after it.** `syncLane` documents that contract and
  //      had no top-level try/catch, so any unanticipated throw took the rest of the run with it.
  //   3. **Lanes must not contaminate each other.** A lane's components are materialized into the shared
  //      workspace; anything left behind is picked up by the next lane's `git add -A` and lands on its
  //      branch under a `Bit-Lane-Head` trailer that does not describe it. `comp3` — a component that
  //      exists on lane A and nowhere else — is what makes that observable.
  //   4. **An ordinary branch must survive the run.** With the union enumeration and the documented
  //      defaults, *every* branch on `origin` lane-maps, so a developer branch that never had a lane
  //      reaches the reconciler looking exactly like a lane branch whose lane was deleted — and that
  //      action deletes the branch. `PLAIN_BRANCH` is the branch that must still be there afterwards.
  // =============================================================================================
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

      // The ordinary developer branch. It is pushed before anything else so it is present for *every*
      // run below — its survival is asserted on the first run and again after the deleted-lane cleanup.
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

      // lane B moves a *different* component, so the two lanes never contend for the same file and any
      // content crossing between them can only be contamination.
      devB = helper.scopeHelper.cloneWorkspace();
      helper.command.runCmd(`bit lane create ${LANE_B}`, devB);
      fs.outputFileSync(path.join(devB, 'comp2', 'index.js'), comp2Src('lane-b-snap-1'));
      helper.command.runCmd('bit snap --message "lane b snap 1"', devB);
      helper.command.runCmd('bit export', devB);
    });

    // -------------------------------------------------------------------------------------------
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

      /**
       * THE branch-destruction lock. `feature-x` has no lane, so `laneHead` is undefined; it exists on
       * `origin`, so `branchExists` is true — the same planner input as a lane branch whose lane was
       * deleted, whose action is `git push origin --delete`. Only the *absence of a `Bit-Lane-Head`
       * trailer in its history* distinguishes them, and that is what makes it a no-op.
       */
      it('should visit an ordinary developer branch and leave it completely alone', () => {
        expect(output, `bit ci sync output:\n${output}`).to.include(
          `${PLAIN_BRANCH} -> noop (branch maps to no lane and has no sync history`
        );
        expect(remoteBranchExists(PLAIN_BRANCH), `origin/${PLAIN_BRANCH} must still exist`).to.be.true;
        expect(branchTipSha(PLAIN_BRANCH)).to.equal(plainBranchSha);
        expect(fileOnBranch(PLAIN_BRANCH, 'docs/notes.md')).to.include('must not be destroyed');
      });

      it("should materialize lane A's exclusive component onto lane A's branch, and only there", () => {
        // lane A is reconciled first (the run order is sorted), so its materialized comp3 files sit in
        // the shared workspace when lane B's turn comes. Without the restore between lanes cleaning up
        // after itself, lane B's `git add -A` commits them under lane B's `Bit-Lane-Head` trailer —
        // content that trailer does not describe.
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

    // -------------------------------------------------------------------------------------------
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

    // -------------------------------------------------------------------------------------------
    // THE `--all` deleted-lane lock. Nothing about lane A exists on bit.cloud any more, so enumerating
    // the remote's lanes yields lane B alone — the branch would be visited only if the run also
    // enumerates the lane-mapped branches on `origin`.
    describe('a lane deleted on bit.cloud is retired by --all, and the surviving lane still syncs', () => {
      let output: string;
      let exitCode: number;
      before(() => {
        // --force: the lane carries snaps never merged into main, which is the normal state of a lane
        // the reconciler was mirroring.
        helper.command.removeRemoteLane(LANE_A, '--force');
        ({ output, exitCode } = runBit('bit ci sync --all'));
        gitFetch();
      });

      it('should still visit the deleted lane, taking it from its branch', () => {
        // Non-vacuous by construction: only lane B exists as a lane on the remote now, so lane A can only
        // have been reached through the branch half of the enumeration. The count is 3 because every
        // branch on `origin` lane-maps under the default config — lane A (branch only), lane B (lane), and
        // the ordinary developer branch, which is visited and then ignored.
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
        // The run that deletes one branch must not have deleted this one on the way past.
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

    // -------------------------------------------------------------------------------------------
    /**
     * A `Bit-Lane-Head` commit that arrives on the branch through a **merge** must not be mistaken for the
     * branch's own sync state.
     *
     * `git log --grep` orders by commit date across *all* parents, so a trailer commit merged in from
     * elsewhere — the default branch carrying another lane's sync commit, an old sync branch merged in —
     * outranks this branch's own sync commit simply by being newer. The adopted `lastSyncedHead` is then
     * another pair's fingerprint, which never equals this lane's head, so every run reads the lane as
     * moved and re-plans work already done.
     *
     * The decoy here is built with plain git rather than by driving a second lane through a merge: it
     * needs to be a trailer commit that is (a) newer than the branch's own and (b) reachable only through
     * a second parent, and forging exactly that is one commit and one merge. The bogus fingerprint
     * (`ffff…`) is what makes the failure legible — if it were adopted, the lane would look moved.
     */
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
        // Merge it into lane B's branch: --no-ff guarantees the decoy stays on the *second* parent, which
        // is exactly where `--first-parent` refuses to look and where default ordering happily looks.
        helper.command.runCmd(`git checkout -f -B ${LANE_B} origin/${LANE_B}`);
        helper.command.runCmd('git merge --no-ff --no-edit decoy-src');
        helper.command.runCmd(`git push origin ${LANE_B}`);
        helper.command.runCmd(`git checkout -f ${defaultBranch}`);
        ({ output, exitCode } = runBit('bit ci sync --all'));
        gitFetch();
      });

      it("should read the branch's OWN sync commit, so the lane does not look moved", () => {
        // The lane never moved; only the branch did. That is `export-branch`. Reading the decoy instead
        // makes the lane look moved and yields `merge-diverged` — the observable pre-fix outcome.
        expect(output, `bit ci sync output:\n${output}`).to.include(`${LANE_B} -> export-branch`);
        expect(output).to.not.include(`${LANE_B} -> merge-diverged`);
        expect(output).to.not.include(`${LANE_B} -> import-lane`);
      });

      it('should succeed and converge, leaving the decoy trailer unused', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        // The fresh trailer the run pushed describes the real lane, never the forged value.
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

  // =============================================================================================
  // Branch ownership: WHICH branches `close-pr` is allowed to delete.
  //
  // `close-pr` is the one irreversible thing this command does — `git push origin --delete`. It fires
  // when the lane is gone and the branch is not, and under the default config *every* branch on `origin`
  // lane-maps, so that shape is reached by ordinary developer branches too. "Does the branch carry a
  // `Bit-Lane-Head` trailer" does not separate them: once a sync PR is squash-, rebase- or ff-merged its
  // trailer lives on the **default branch's own first-parent line**, so every branch cut from the default
  // branch afterwards inherits one.
  //
  // The real rule has two parts — the sync commit must *name this lane*, and either it is not yet in the
  // default branch (a live lane branch) or the branch tip is (nothing to lose). This block walks one lane
  // branch through all three outcomes, plus the inherited-trailer branch that must never be touched.
  // =============================================================================================
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

      // Now simulate what a squash-, rebase- or fast-forward-merged sync PR leaves behind: a commit with
      // our exact sync shape — subject, `Bit-Lane-Head` trailer, `[bit-sync]` marker — sitting on the
      // DEFAULT branch's own first-parent line. It names a different lane, because that is what a merged
      // sync PR for some other lane looks like. Empty on purpose, so it cannot show up as main-scope drift.
      helper.command.runCmd(`git checkout -f -B ${defaultBranch} origin/${defaultBranch}`);
      helper.command.runCmd(
        `git commit --allow-empty ` +
          `-m "chore(bit-sync): sync lane ${helper.scopes.remote}/other-lane @ abc123def" ` +
          `-m "Bit-Lane-Head: ${'a'.repeat(40)}" -m "[bit-sync]"`
      );
      helper.command.runCmd(`git push origin ${defaultBranch}`);

      // The developer branch is cut from THAT tip, so it inherits the trailer, and then carries work of
      // its own that exists nowhere else.
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
      // `-s ours` records the merge — which is all the ownership check reads, since it asks only about
      // reachability — while leaving the default branch's tree (and `.bitmap`, which must stay on main)
      // exactly as it was. A content merge here would put the lane pointer on the default branch and the
      // main-scope sync would rightly refuse to run.
      helper.command.runCmd(`git merge -s ours --no-edit origin/${LANE}`);
      helper.command.runCmd(`git push origin ${defaultBranch}`);
      gitFetch();
    }

    // -------------------------------------------------------------------------------------------
    /**
     * THE inherited-trailer lock — the reviewer's live repro. `feature-x` has a `Bit-Lane-Head` trailer on
     * its own first-parent line, inherited from the default branch, and no lane. A trailer-presence check
     * calls that "lane-managed" and deletes the branch.
     */
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
        // Without this the test could pass because the trailer never landed. The trailer is on the
        // branch's own first-parent line and names a lane that is NOT this branch's.
        const log = helper.command.runCmd(`git log origin/${PLAIN_BRANCH} --first-parent --format=%B`);
        expect(log).to.include('Bit-Lane-Head:');
        expect(log).to.include(`sync lane ${helper.scopes.remote}/other-lane`);
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

    // -------------------------------------------------------------------------------------------
    /**
     * The lane's own branch, whose sync PR was merged and which then received more commits. The PR should
     * be closed, but those commits are in no other ref — so the branch must survive.
     */
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

    // -------------------------------------------------------------------------------------------
    /**
     * The legitimate cleanup: the lane is gone and the branch is fully contained in the default branch, so
     * retiring it cannot lose anything. This is the just-merged lane whose branch the git host did not
     * auto-delete — the case the ownership rule must keep working.
     */
    describe('our own branch that is fully merged into the default branch (own-merged)', () => {
      let output: string;
      let exitCode: number;
      before(() => {
        // The remaining commits reach the default branch, so nothing on the branch is unique to it.
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
        // The run that legitimately deletes one branch must not take the other with it.
        expect(remoteBranchExists(PLAIN_BRANCH)).to.be.true;
        expect(branchTipSha(PLAIN_BRANCH)).to.equal(plainBranchSha);
      });
    });
  });
});
