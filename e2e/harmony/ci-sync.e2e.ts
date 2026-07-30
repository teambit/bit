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
 *   - `switchToLane`'s `forceOurs: true` default made the import direction a `.bitmap`-only commit whose
 *     recorded state claimed the branch mirrored the lane (it didn't).
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

  /**
   * Make the workspace's local bit scope **cold** — the state a production run is always in, and the one
   * this whole suite otherwise never reaches.
   *
   * `bit ci sync` runs on an ephemeral CI runner: a fresh `git clone`, `bit init`, and a local scope that
   * has never imported anything. Every other scenario here reuses one long-lived workspace whose scope is
   * warm by the time it is asserted on, so any code that silently depends on a cached lane object passes
   * all of them and fails on every real run. Wiping the scope directory and re-initializing reproduces the
   * runner exactly: `.bitmap` and `workspace.jsonc` are workspace files and survive (as they would in a
   * fresh clone), while every object — lane objects above all — is gone.
   *
   * Both scope locations are removed because which one bit picks depends on whether `.git` existed when
   * `bit init` ran, and this suite's setup order (bit init, then git init) is not the only one a user has.
   * The remote has to be re-registered because that registration lives *in* the scope we just deleted.
   */
  function makeLocalScopeCold() {
    const workspace = helper.scopes.localPath;
    fs.removeSync(path.join(workspace, '.bit'));
    fs.removeSync(path.join(workspace, '.git', 'bit'));
    helper.command.runCmd('bit init');
    helper.scopeHelper.addRemoteScope();
  }

  /**
   * How many objects the workspace's local scope holds — the measurable form of "cold".
   *
   * Used instead of a `bit lane list` probe because a genuinely cold scope cannot answer that: `.bitmap`
   * names components whose objects are not there yet, and the command exits non-zero with
   * `<comp> is missing, please run "bit import"`. That is not a symptom of anything wrong — it is what a
   * fresh clone looks like before its first sync — but it makes the CLI the wrong instrument. Counting
   * files under the scope's object store asks the question directly, and asking it twice (before and after)
   * proves both halves: the run started with nothing and had to fetch what it needed.
   */
  function scopeObjectCount(): number {
    const candidates = [
      path.join(helper.scopes.localPath, '.bit', 'objects'),
      path.join(helper.scopes.localPath, '.git', 'bit', 'objects'),
    ];
    const root = candidates.find((dir) => fs.existsSync(dir));
    if (!root) return 0;
    let count = 0;
    const walk = (dir: string) => {
      fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else count += 1;
      });
    };
    walk(root);
    return count;
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
    /**
     * THE unexported-work lock on `close-pr`. D2 left the branch tip at a dev commit the conflict kept
     * from ever being exported — its content is on no lane (the lane is being deleted right here) and
     * not in the default branch (the sync PR was never merged): it exists in NO other ref. The evidence
     * is `own-live` *with dev commits*, and deleting the branch would destroy the only copy. The
     * genuine-deletion coverage lives in the two-lane block (own-live, no dev commits) and in the
     * ownership block (own-merged).
     */
    describe('lane removed from the remote while the branch holds unexported work -> close-pr keeps the branch', () => {
      let output: string;
      let exitCode: number;
      let tipBefore: string;
      before(() => {
        tipBefore = branchTipSha(LANE);
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
          // The kept branch stays visible to every later run until a human deletes it (or merges it).
          // Idempotent by construction: closing an already-closed PR and keeping a branch write nothing.
          expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
          expect(rerun.output).to.include(`branch ${LANE} kept`);
          expect(remoteBranchExists(LANE)).to.be.true;
          expect(branchTipSha(LANE)).to.equal(tipBefore);
        });
      });
    });
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
       * deleted, whose action is `git push origin --delete`. Only the *absence of a lane pointer in its
       * committed `.bitmap`* distinguishes them, and that is what makes it a no-op.
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
        // First, resolve lane A's halted divergence the way a developer would and let one sync run
        // converge the pair: put comp1 back to the branch's last-synced content (so only the lane still
        // holds a change to it — the merge is then conflict-free) and push fresh comp2 work for the run
        // to export. That leaves the branch tip a sync commit with nothing above it, so the deletion
        // below exercises `close-pr`'s genuine delete path (own-live, NO unexported work). A branch
        // still carrying unexported dev commits is *kept*, which has its own scenario in the
        // reconcile-cycle block.
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
     * A sync-shaped commit that arrives on the branch through a **merge** must not be mistaken for the
     * branch's own state.
     *
     * Two independent defences are exercised here, and this scenario proves both:
     *
     *   1. **Message text is not state.** The decoy carries our exact subject, `Bit-Lane-Head` trailer and
     *      `[bit-sync]` marker, with a bogus fingerprint (`ffff…`). Under the v2 (bit-native) model those
     *      are annotations and nothing reads them, so adopting the forged value is impossible by
     *      construction — where the trailer-derived model would have read the lane as moved.
     *   2. **`--first-parent` on the state walk.** `git log` orders by commit date across *all* parents, so
     *      any state-bearing commit merged in from elsewhere is newer than this branch's own and would
     *      outrank it. `readBranchSyncState` walks `--first-parent -- .bitmap`, which is this branch's own
     *      line of development — the only line whose state describes this pair.
     *
     * The decoy is built with plain git rather than by driving a second lane through a merge: it needs to be
     * a commit that is (a) newer than the branch's own and (b) reachable only through a second parent, and
     * forging exactly that is one commit and one merge.
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
  // lane-maps, so that shape is reached by ordinary developer branches too. Nothing about how a branch
  // *looks* separates them: once a sync PR is squash-, rebase- or ff-merged, both the message it carried
  // and the `.bitmap` it wrote live on the **default branch's own first-parent line**, so every branch cut
  // from the default branch afterwards inherits them.
  //
  // The real rule has two parts — the branch's committed `.bitmap` must *point at this lane*, and either the
  // commit that wrote it is not yet in the default branch (a live lane branch) or the branch tip is
  // (nothing to lose). This block walks one lane branch through all three outcomes, plus the branch with
  // inherited history that must never be touched.
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
     * THE inherited-history lock — the reviewer's live repro. `feature-x` has a `Bit-Lane-Head` trailer on
     * its own first-parent line, inherited from the default branch, and no lane. A trailer-presence check
     * calls that "lane-managed" and deletes the branch. Under the v2 model the trailer is not consulted at
     * all, and the structural answer agrees: `feature-x` carries the default branch's `.bitmap`, which has
     * no lane pointer.
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

      it('should be ignored on the STRUCTURAL evidence: its .bitmap points at no lane', () => {
        // The v2 reason the branch is untouchable, asserted directly rather than inferred from the outcome:
        // `feature-x` carries the default branch's `.bitmap`, which is on main. The forged trailer above is
        // exactly the channel that is no longer consulted — this is what it is no longer consulted in
        // favour of.
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

  // =============================================================================================
  // Cross-scope lanes (Stage 0). A lane has two independent scope relations: the scope that HOSTS the
  // lane object, and the scopes its COMPONENTS belong to. The reconciler maps one repository to one
  // scope, and it reconciles a lane WHOLE — it fingerprints, materializes, snaps and exports every
  // component on it. So:
  //   - foreign CONTENT is refused outright (it would write, PR and export another repo's components
  //     from this one), and
  //   - a foreign HOST is fine, as long as the content is this repo's — it just has to be addressed by
  //     its scope-qualified id, because a branch/lane name carries no scope.
  // These two blocks lock exactly that split.
  // =============================================================================================
  describe('a lane whose components span two scopes is refused, never half-mirrored', () => {
    const LANE = 'cross-scope';
    let otherScope: string;
    let devPath: string;
    let refsBeforeSync: string;
    let defaultBranch: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      // A second remote scope, mutually reachable with this workspace's defaultScope, so one lane can
      // legitimately carry components of both — which is what a real org-global lane looks like.
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope('-other-scope');
      otherScope = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);
      setupGitRemote();
      setSyncConfig({ lanes: ['*'] });

      // comp1 belongs to this repository's scope; comp2 to the other one. (The variant has to be set
      // before `bit add`, so the component is tracked with the right defaultScope from the start.)
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
      // Non-vacuity: if the fixture failed to place comp2 in the other scope, the halt below would be
      // asserting nothing at all.
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
        // The user asked for THIS lane, so silence would be the wrong answer — but it is a refusal, not a
        // sync conflict: there is no branch and no PR, and nothing about the repository needs fixing.
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
        // The check runs between reading the lane/branch state and planning: the lane moved and the branch
        // is absent, which is exactly the shape that would otherwise plan `import-lane`.
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

      /**
       * The green-run lock. A cross-scope lane is a legitimate thing for someone to have created, and this
       * repository simply has no branch to make for it. If an enumerated encounter failed the run, one
       * standing cross-scope lane would turn every scheduled sync permanently red — and a pipeline that is
       * always red is one nobody reads.
       */
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

    /**
     * The one cross-scope shape that IS a halt: the pair was reconcilable — this repository had already
     * mirrored the lane onto a branch — and the lane then grew a foreign component. The branch, its open PR
     * and any dev commits on it can never converge with the lane again, so it is handed to a human.
     */
    describe('a lane that became cross-scope AFTER its branch existed', () => {
      const MID_FLIGHT_LANE = 'mid-flight';
      let output: string;
      let exitCode: number;
      let shaBefore: string;

      before(() => {
        // Phase 1: an ordinary single-scope lane, mirrored onto its branch by this repository.
        // Step off the cross-scope lane first — a lane forked from another lane inherits its components,
        // and both files are restored to main's content so only the edit below counts as modified.
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

      /**
       * The two cross-scope outcomes in one run: the lane that never had a branch is skipped and stays
       * green, the mid-flight one halts and makes the run non-zero. A single `--all` has to be able to
       * report both without either one swallowing the other.
       */
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

    /**
     * A `branches` override can map a lane onto the repository's **default branch**, which belongs to the
     * main-scope path — the one path that never writes to it directly, always proposing a PR instead. The
     * lane path would force-checkout that branch, commit and push. `--all` reaches the per-lane reconciler
     * without passing the command layer's name checks, so the guard has to live in the reconciler itself;
     * this is what proves it does.
     */
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
        // Ordering lock: the reserved-branch guard is the first thing the reconciler does. If it ran after
        // the purity check, this line would report the cross-scope skip instead.
        expect(output).to.not.include(`${LANE} -> skipped (cross-scope lane:`);
      });

      it('should not have written to the default branch', () => {
        // The main-scope path may legitimately push its own sync branch during this run; the default
        // branch itself must be untouched by anything.
        expect(branchTipSha(defaultBranch)).to.equal(defaultBranchShaBefore);
        expect(exitCode, `bit ci sync --all output:\n${output}`).to.not.equal(0); // the mid-flight lane still halts
      });
    });
  });

  // ---------------------------------------------------------------------------------------------
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
        // THE attribution lock. The next run recognizes this branch as this lane's mirror by the `.bitmap`
        // lane pointer, and that pointer is scope-qualified — exactly what the branch-aliasing halt below
        // compares. A pointer at `<defaultScope>/<name>` would name a lane that does not exist.
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

      /**
       * A branch name carries no scope, so this path resolves the lane against `defaultScope` — where it
       * does not exist. The branch's `.bitmap` points at `<hostScope>/<lane>`, so it does not match either,
       * and the evidence is `inherited-or-none`. The documented Stage-0 trade: a foreign-hosted lane must
       * be re-targeted by its full id, and in exchange the fallback direction is the safe one — the
       * branch is left alone, never retired on the strength of a lane the reconciler failed to find.
       */
      it('should leave the branch alone rather than retire it', () => {
        expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
        expect(output).to.include(`${LANE} -> noop`);
        expect(output).to.not.include('close-pr');
        expect(remoteBranchExists(LANE)).to.be.true;
        expect(branchTipSha(LANE)).to.equal(shaBefore);
      });
    });

    /**
     * THE branch-aliasing lock. The branch mapping is keyed on the lane NAME, so a lane of the SAME NAME in
     * this repository's own scope maps onto the branch that already mirrors the foreign-hosted one. Planning
     * for it would hijack the branch: `import-lane` would materialize this lane's content over the other
     * lane's and repoint its `.bitmap`, and the other lane's PR would silently become a diff of somebody
     * else's work.
     */
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
        // A second developer workspace, so the same lane NAME can be created in this repository's own
        // scope (one workspace cannot hold two lanes with the same local alias).
        rivalDevPath = helper.scopeHelper.cloneWorkspace();
        // Same lane NAME, this repository's own scope. `--alias` because the workspace already tracks the
        // foreign-hosted lane under that name locally; the lane id (`<defaultScope>/<name>`) is what the
        // reconciler resolves, and it is genuinely a different lane.
        helper.command.runCmd(`bit lane create ${LANE} --alias rival`, rivalDevPath);
        fs.outputFileSync(path.join(rivalDevPath, 'comp2', 'index.js'), comp2Src('rival-lane-snap'));
        helper.command.runCmd('bit snap --message "rival lane snap"', rivalDevPath);
        helper.command.runCmd('bit export', rivalDevPath);

        // The dry run goes FIRST, because the thing it must not do is permanent: labelling the branch
        // owner's PR freezes that lane's syncs until a human removes the label. Running it after the real
        // halt would prove nothing — the label would already be there.
        refsBeforeDryRun = remoteRefs();
        ({ output: dryRunOutput, exitCode: dryRunExit } = runBit(`bit ci sync ${LANE} --dry-run`));
        gitFetch();

        // Bare name => this workspace's defaultScope, i.e. the rival lane.
        ({ output, exitCode } = runBit(`bit ci sync ${LANE}`));
        gitFetch();
      });

      /**
       * `--dry-run` promises no pull request is created, closed, labelled or commented on. This halt is the
       * one that would break that promise most expensively: the PR it annotates belongs to the *other*
       * lane — the branch's owner — whose own lane is perfectly healthy, and the label would stop its syncs
       * until a human intervened. A dry run must therefore report the halt and touch nothing.
       */
      it('should report the halt under --dry-run without annotating the owner’s PR', () => {
        expect(dryRunExit, `bit ci sync --dry-run output:\n${dryRunOutput}`).to.not.equal(0);
        expect(dryRunOutput).to.include(`HALTED ${LANE} -> branch ${LANE} mirrors lane ${hostScope}/${LANE}`);
        // The marker only the dry-run path prints — proof the PR-writing branch was skipped rather than
        // merely having had no PR to write to.
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

  // =============================================================================================
  // `bit ci sync --init` — one-command onboarding scaffolding. Unlike every other scenario in this
  // file, this never touches bit.cloud or a lane: it is pure local scaffolding (two workflow files
  // plus the workspace.jsonc config block), so the setup only needs a workspace with a git remote.
  // =============================================================================================
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
      expect(syncYml).to.include(`branches-ignore: [${defaultBranch}, 'bit-sync/**']`);
      expect(releaseYml).to.include(`branches: [${defaultBranch}]`);
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

    it('refuses to combine --init with another flag rather than silently ignoring one of them', () => {
      const { output, exitCode } = runBit('bit ci sync --init --dry-run');
      expect(exitCode, `bit ci sync --init --dry-run output:\n${output}`).to.not.equal(0);
      expect(output).to.include('--init');
      expect(output).to.include('cannot be combined');
    });
  });
});
