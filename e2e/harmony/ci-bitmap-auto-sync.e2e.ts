import chai, { expect } from 'chai';
import chaiFs from 'chai-fs';
import * as path from 'path';
import fs from 'fs-extra';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(chaiFs);

/**
 * E2E for the "bitmap auto-sync" workflow that lets repos with strict branch-protection
 * rules use Bit without having `bit ci merge` push a `.bitmap` commit to the default branch.
 *
 * Mode is opt-in via `bitmapAutoSync: true` under `teambit.workspace/workspace` in
 * `workspace.jsonc`. When set, two things happen:
 *   1. `bit ci merge --no-bitmap-commit` skips the post-tag git commit + push.
 *   2. Every Bit command in a workspace where `bitmapAutoSync` is enabled checks at
 *      bootstrap whether git HEAD has moved since the last reconciliation (sentinel
 *      file at `.bit/last-pull-sync`). If so, it imports current scope objects and
 *      writes the latest scope HEAD versions into the local `.bitmap`.
 *
 * The combined effect: a developer's workflow is `git pull && <any bit command>` —
 * no manual `bit checkout head`, and no CI commit ever lands on the default branch.
 */
describe('ci merge with bitmap auto-sync mode', function () {
  this.timeout(0);
  let helper: Helper;

  before(() => {
    helper = new Helper();
  });

  after(() => {
    helper.scopeHelper.destroy();
  });

  /**
   * Create a bare git repository to serve as origin and wire it up to the current workspace.
   * Returns the bare-repo path.
   */
  function setupGitRemote(): string {
    const { scopePath } = helper.scopeHelper.getNewBareScope();
    const bareRepoPath = scopePath.replace('.bit', '.git');
    helper.command.runCmd(`git init --bare ${bareRepoPath}`);

    helper.git.initNewGitRepo(true);
    helper.command.runCmd(`git remote add origin ${bareRepoPath}`);

    return bareRepoPath;
  }

  /**
   * Populate the workspace with `numComponents` components, tag and export them, write a
   * `.gitignore`, then make the initial git commit and push to origin.
   * Returns the default branch name (varies by git version: `main` or `master`).
   */
  function setupComponentsAndInitialCommit(numComponents = 2): string {
    helper.fixtures.populateComponents(numComponents);
    helper.command.tagAllWithoutBuild();
    helper.command.export();

    helper.fs.outputFile('.gitignore', 'node_modules/\n.bit/\n');

    helper.command.runCmd('git add .');
    helper.command.runCmd('git commit -m "initial commit"');

    const branch = helper.command.runCmd('git branch --show-current').trim();
    helper.command.runCmd(`git push -u origin ${branch}`);

    return branch;
  }

  /** Set the new opt-in flag under `teambit.workspace/workspace`. */
  function enableBitmapAutoSync(): void {
    helper.workspaceJsonc.addKeyValToWorkspace('bitmapAutoSync', true);
  }

  /** Stage workspace.jsonc, commit it, and push the change to origin. */
  function commitAndPushWorkspaceJsonc(branch: string, message = 'chore: enable bitmapAutoSync'): void {
    helper.command.runCmd('git add workspace.jsonc');
    helper.command.runCmd(`git commit -m "${message}"`);
    helper.command.runCmd(`git push origin ${branch}`);
  }

  /**
   * Simulate a developer's PR being merged into the default branch.
   * Creates a feature branch, applies `fileChanges`, commits, switches back to `branch`,
   * fast-forward-merges and pushes — i.e. origin/branch now has the merge commit
   * but no `.bitmap` update yet.
   */
  function simulatePrMergedOnDefaultBranch(
    branch: string,
    featureName: string,
    fileChanges: () => void,
    commitMessage: string
  ): void {
    helper.command.runCmd(`git checkout -b feature/${featureName}`);
    fileChanges();
    helper.command.runCmd('git add .');
    helper.command.runCmd(`git commit -m "${commitMessage}"`);
    helper.command.runCmd(`git checkout ${branch}`);
    helper.command.runCmd(`git merge feature/${featureName} --no-ff -m "Merge ${featureName}"`);
    helper.command.runCmd(`git push origin ${branch}`);
  }

  /** Read the sentinel file path used by the auto-sync mechanism. */
  function getSentinelPath(workspaceDir: string = helper.scopes.localPath): string {
    return path.join(workspaceDir, '.bit', 'last-pull-sync');
  }

  // ------------------------------------------------------------------------------------
  // Regression guard: with the flag absent, the existing `bit ci merge` flow is unchanged.
  // ------------------------------------------------------------------------------------
  describe('regression: workspace WITHOUT bitmapAutoSync flag', () => {
    let mergeOutput: string;
    let logAfterMerge: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      const branch = setupComponentsAndInitialCommit();

      simulatePrMergedOnDefaultBranch(
        branch,
        'regression-test',
        () => helper.fs.outputFile('comp1/comp1.js', 'console.log("regression");'),
        'fix: comp1 update'
      );

      mergeOutput = helper.command.runCmd('bit ci merge');
      logAfterMerge = helper.command.runCmd(`git log ${branch} --oneline -n 5`);
    });

    it('should complete successfully', () => {
      expect(mergeOutput).to.include('Merged PR');
    });

    it('should still create a CI commit on the default branch (existing behavior)', () => {
      // The default commit message contains either "Bit CI" as committer or
      // "[skip ci]" / ".bitmap" in the message.
      expect(logAfterMerge).to.match(/skip ci|update .bitmap|Bit CI/i);
    });

    it('should still tag the component', () => {
      const list = helper.command.listParsed();
      const comp1 = list.find((c) => c.id.includes('comp1'));
      expect(comp1).to.exist;
      expect(comp1?.currentVersion).to.equal('0.0.2');
    });
  });

  // ------------------------------------------------------------------------------------
  // Basic CI side: the flag + the new CLI option together skip the master commit cleanly.
  // ------------------------------------------------------------------------------------
  describe('with bitmapAutoSync enabled and --no-bitmap-commit flag', () => {
    let mergeOutput: string;
    let branch: string;
    let originHeadBeforeMerge: string;
    let originHeadAfterMerge: string;
    let localHeadAfterMerge: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      branch = setupComponentsAndInitialCommit();
      enableBitmapAutoSync();
      commitAndPushWorkspaceJsonc(branch);

      simulatePrMergedOnDefaultBranch(
        branch,
        'no-commit-test',
        () => helper.fs.outputFile('comp1/comp1.js', 'console.log("no-commit");'),
        'feat: comp1 update for no-commit'
      );

      // Snapshot origin's HEAD immediately before `bit ci merge`. After the merge runs,
      // it must be byte-identical: nothing got pushed to origin from the CI side.
      originHeadBeforeMerge = helper.command.runCmd(`git rev-parse origin/${branch}`).trim();
      mergeOutput = helper.command.runCmd('bit ci merge --no-bitmap-commit --message "test"');
      originHeadAfterMerge = helper.command.runCmd(`git rev-parse origin/${branch}`).trim();
      localHeadAfterMerge = helper.command.runCmd('git rev-parse HEAD').trim();
    });

    it('should complete successfully', () => {
      expect(mergeOutput).to.include('Merged PR');
    });

    it('should explicitly indicate the bitmap commit was skipped in output', () => {
      // The command should announce the skip so CI logs make the behavior obvious.
      expect(mergeOutput).to.match(/Skipping .*bitmap commit|--no-bitmap-commit/i);
    });

    it('should NOT push any new commit to origin from the CI side', () => {
      expect(originHeadAfterMerge).to.equal(originHeadBeforeMerge);
    });

    it('local HEAD should equal origin HEAD (no extra local commit either)', () => {
      // Unlike --skip-push, --no-bitmap-commit does not even create a local commit.
      // The CI workspace is ephemeral; any local .bitmap modifications stay uncommitted.
      expect(localHeadAfterMerge).to.equal(originHeadAfterMerge);
    });

    it('should still tag the component locally', () => {
      const list = helper.command.listParsed();
      const comp1 = list.find((c) => c.id.includes('comp1'));
      expect(comp1?.currentVersion).to.equal('0.0.2');
    });

    it('should still export the new version to the remote scope', () => {
      const list = helper.command.listRemoteScopeParsed();
      const comp1 = list.find((c) => c.id.includes('comp1'));
      expect(comp1?.localVersion).to.equal('0.0.2');
    });
  });

  // ------------------------------------------------------------------------------------
  // The headline scenario: a downstream developer pulls and runs ANY command — no manual
  // `bit checkout head`, no `bit install`, just `git pull` + the command they were going
  // to run anyway.
  // ------------------------------------------------------------------------------------
  describe('downstream developer workspace auto-syncs after git pull', () => {
    let devWorkspaceClone: string;
    let branch: string;
    const compId = `comp1`;

    before(() => {
      // ── CI workspace setup ──
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      branch = setupComponentsAndInitialCommit();
      enableBitmapAutoSync();
      commitAndPushWorkspaceJsonc(branch);

      // Snapshot the workspace as the developer's local clone *before* any further
      // CI work. From the developer's perspective, this is what they have on disk
      // immediately after their last `git pull` (origin/main is at 0.0.1).
      devWorkspaceClone = helper.scopeHelper.cloneWorkspace();

      // ── CI workspace runs the merge ──
      simulatePrMergedOnDefaultBranch(
        branch,
        'downstream-sync',
        () => helper.fs.outputFile('comp1/comp1.js', 'console.log("downstream");'),
        'feat: comp1 update for downstream sync'
      );
      helper.command.runCmd('bit ci merge --no-bitmap-commit --message "downstream"');

      // ── Switch to the developer's snapshot for the rest of this describe block ──
      helper.scopeHelper.getClonedWorkspace(devWorkspaceClone);
    });

    describe('before the developer has run `git pull`', () => {
      it('local .bitmap reflects the old version', () => {
        const bitmap = helper.bitMap.read();
        const entry = bitmap[compId] || bitmap[`${helper.scopes.remote}/${compId}`];
        expect(entry?.version).to.equal('0.0.1');
      });
    });

    describe('after `git pull` brings in the merge commit (no .bitmap delta in git)', () => {
      before(() => {
        helper.command.runCmd(`git pull origin ${branch}`);
      });

      it('the .bitmap on disk has not yet been updated by Bit', () => {
        // git pull alone does not update the bitmap — origin never had the new bitmap.
        const bitmap = helper.bitMap.read();
        const entry = bitmap[compId] || bitmap[`${helper.scopes.remote}/${compId}`];
        expect(entry?.version).to.equal('0.0.1');
      });

      describe('the first bit command after pull (`bit status`)', () => {
        before(() => {
          helper.command.status();
        });

        it('triggers auto-sync, updating .bitmap to scope HEAD (0.0.2)', () => {
          const bitmap = helper.bitMap.read();
          const entry = bitmap[compId] || bitmap[`${helper.scopes.remote}/${compId}`];
          expect(entry?.version).to.equal('0.0.2');
        });

        it('writes the sentinel file recording the synced git HEAD', () => {
          const sentinelPath = getSentinelPath();
          expect(sentinelPath).to.be.a.file();
          const sentinelContent = fs.readFileSync(sentinelPath, 'utf-8').trim();
          const currentGitHead = helper.command.runCmd('git rev-parse HEAD').trim();
          expect(sentinelContent).to.include(currentGitHead);
        });

        it('reports a clean status (no outdated, no modified)', () => {
          helper.command.expectStatusToBeClean();
        });

        it('leaves .bitmap as a local working-tree modification in git', () => {
          // Documents the user-visible side effect: origin's tracked .bitmap stays at
          // the old version (CI never pushes), but our local copy is freshly rewritten
          // by the auto-sync. So `git status` will show .bitmap as modified — devs
          // should NOT commit it (committing would defeat the whole workflow).
          const gitStatus = helper.command.runCmd('git status --porcelain .bitmap').trim();
          expect(gitStatus).to.match(/M\s+\.bitmap$/);
        });
      });
    });
  });

  // ------------------------------------------------------------------------------------
  // The auto-sync must work as the FIRST command, regardless of which command it is.
  // We exercise the common entry points one by one — each starts from the unsynced
  // dev-workspace snapshot, runs `git pull`, then runs ITS command first, and checks
  // the bitmap was synced.
  // ------------------------------------------------------------------------------------
  describe('auto-sync works regardless of which command runs first', () => {
    let devWorkspaceClone: string;
    let branch: string;
    const compId = `comp1`;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      branch = setupComponentsAndInitialCommit();
      enableBitmapAutoSync();
      commitAndPushWorkspaceJsonc(branch);

      devWorkspaceClone = helper.scopeHelper.cloneWorkspace();

      simulatePrMergedOnDefaultBranch(
        branch,
        'first-command',
        () => helper.fs.outputFile('comp1/comp1.js', 'console.log("first-cmd");'),
        'feat: comp1 update'
      );
      helper.command.runCmd('bit ci merge --no-bitmap-commit');
    });

    /**
     * Helper: rewind to the freshly-cloned dev workspace, do a `git pull`, run the
     * given command as the first action in that workspace, and return the post-state
     * bitmap version for `comp1`.
     */
    function runAsFirstCommand(commandFn: () => void): string {
      helper.scopeHelper.getClonedWorkspace(devWorkspaceClone);
      // The clone was taken before the CI work, so re-clone fresh each time by using
      // a sub-snapshot. cloneWorkspace returns the path; getClonedWorkspace restores it.
      helper.command.runCmd(`git pull origin ${branch}`);
      commandFn();
      const bitmap = helper.bitMap.read();
      const entry = bitmap[compId] || bitmap[`${helper.scopes.remote}/${compId}`];
      return entry?.version;
    }

    // Note: getClonedWorkspace destroys the current dir and restores from the snapshot,
    // so each runAsFirstCommand call starts fresh from the same pre-CI state.

    it('`bit status` as first command syncs bitmap', () => {
      const version = runAsFirstCommand(() => helper.command.status());
      expect(version).to.equal('0.0.2');
    });

    it('`bit list` as first command syncs bitmap', () => {
      const version = runAsFirstCommand(() => helper.command.list());
      expect(version).to.equal('0.0.2');
    });

    it('`bit show` as first command syncs bitmap', () => {
      const version = runAsFirstCommand(() => helper.command.runCmd(`bit show ${compId}`));
      expect(version).to.equal('0.0.2');
    });

    it('`bit log` as first command syncs bitmap', () => {
      const version = runAsFirstCommand(() => helper.command.runCmd(`bit log ${compId}`));
      expect(version).to.equal('0.0.2');
    });

    it('`bit compile` as first command syncs bitmap', () => {
      const version = runAsFirstCommand(() => helper.command.runCmd(`bit compile`));
      expect(version).to.equal('0.0.2');
    });
  });

  // ------------------------------------------------------------------------------------
  // Sentinel caching: once the sync has happened for a given git HEAD, a subsequent
  // command in the same git state should not re-sync. We can't easily intercept network
  // calls, but we can verify the sentinel file is unchanged across two calls.
  // ------------------------------------------------------------------------------------
  describe('sentinel caching across commands at the same git HEAD', () => {
    let branch: string;
    let sentinelMtimeAfterFirstCmd: number;
    let sentinelContentAfterFirstCmd: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      branch = setupComponentsAndInitialCommit();
      enableBitmapAutoSync();
      commitAndPushWorkspaceJsonc(branch);

      const devClone = helper.scopeHelper.cloneWorkspace();

      simulatePrMergedOnDefaultBranch(
        branch,
        'sentinel-cache',
        () => helper.fs.outputFile('comp1/comp1.js', 'console.log("cache");'),
        'feat: cache test'
      );
      helper.command.runCmd('bit ci merge --no-bitmap-commit');

      // Switch to dev clone, pull, and run the first command.
      helper.scopeHelper.getClonedWorkspace(devClone);
      helper.command.runCmd(`git pull origin ${branch}`);
      helper.command.status(); // first command — triggers sync

      const sentinelPath = getSentinelPath();
      sentinelMtimeAfterFirstCmd = fs.statSync(sentinelPath).mtimeMs;
      sentinelContentAfterFirstCmd = fs.readFileSync(sentinelPath, 'utf-8');

      // Run a second command in the same git state.
      helper.command.list();
    });

    it('sentinel file content should be identical after the second command (same git HEAD)', () => {
      const currentContent = fs.readFileSync(getSentinelPath(), 'utf-8');
      expect(currentContent).to.equal(sentinelContentAfterFirstCmd);
    });

    it('sentinel file mtime should not regress', () => {
      // Either equal (write was skipped) or moderately later (touched). Crucially not a
      // network-roundtrip-and-rewrite cycle. We assert mtime equality as the strict case.
      const currentMtime = fs.statSync(getSentinelPath()).mtimeMs;
      expect(currentMtime).to.equal(sentinelMtimeAfterFirstCmd);
    });
  });

  // ------------------------------------------------------------------------------------
  // Multi-cycle: two sequential PR merges, each followed by a `git pull` on the dev side.
  // The dev's bitmap should track scope HEAD precisely at each step, never lagging.
  // ------------------------------------------------------------------------------------
  describe('multiple sequential PR cycles', () => {
    let devClone: string;
    let branch: string;
    const compId = `comp1`;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      branch = setupComponentsAndInitialCommit();
      enableBitmapAutoSync();
      commitAndPushWorkspaceJsonc(branch);

      devClone = helper.scopeHelper.cloneWorkspace();
    });

    function runCiCycle(featureName: string, contentMarker: string, cycleMessage: string) {
      simulatePrMergedOnDefaultBranch(
        branch,
        featureName,
        () => helper.fs.outputFile('comp1/comp1.js', `console.log("${contentMarker}");`),
        cycleMessage
      );
      helper.command.runCmd('bit ci merge --no-bitmap-commit');
    }

    it('cycle 1: dev syncs to 0.0.2', () => {
      runCiCycle('cycle-1', 'cycle-1', 'feat: cycle 1');

      helper.scopeHelper.getClonedWorkspace(devClone);
      helper.command.runCmd(`git pull origin ${branch}`);
      helper.command.status();

      const bitmap = helper.bitMap.read();
      const entry = bitmap[compId] || bitmap[`${helper.scopes.remote}/${compId}`];
      expect(entry?.version).to.equal('0.0.2');
    });

    it('cycle 2: dev syncs to 0.0.3', () => {
      // Switch back to the CI workspace by re-cloning and re-applying the workspace
      // path — easiest is to use the original local path, which the CI work happened in.
      // The previous test's getClonedWorkspace put us in the dev clone; we can just
      // continue the CI loop in this directory since it now has the same git history.
      // To keep the model clean, run the next CI cycle directly in the dev clone after
      // the sync — which is functionally equivalent to a fresh CI run.
      runCiCycle('cycle-2', 'cycle-2', 'feat: cycle 2');

      // Reset the dev workspace to its pristine snapshot and pull both cycles' commits.
      helper.scopeHelper.getClonedWorkspace(devClone);
      helper.command.runCmd(`git pull origin ${branch}`);
      helper.command.status();

      const bitmap = helper.bitMap.read();
      const entry = bitmap[compId] || bitmap[`${helper.scopes.remote}/${compId}`];
      expect(entry?.version).to.equal('0.0.3');
    });
  });

  // ------------------------------------------------------------------------------------
  // Continuous developer flow: the existing multi-cycle test resets the workspace
  // between cycles, which is unrealistic. Real devs keep working in the same checkout
  // across many `git pull`s — their .bitmap accumulates auto-sync rewrites from prior
  // cycles (and shows as "modified" in git the whole time). This test verifies that
  // multiple sequential pulls + auto-syncs work without resetting, never lose state,
  // and don't trip over the lingering working-tree modification to .bitmap.
  // ------------------------------------------------------------------------------------
  describe('continuous developer flow — multiple sync cycles in the same workspace', () => {
    let branch: string;
    const compId = `comp1`;

    function bitmapVersion(): string | undefined {
      const bitmap = helper.bitMap.read();
      const entry = bitmap[compId] || bitmap[`${helper.scopes.remote}/${compId}`];
      return entry?.version;
    }

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      branch = setupComponentsAndInitialCommit();
      enableBitmapAutoSync();
      commitAndPushWorkspaceJsonc(branch);
    });

    it('cycle 1: bitmap syncs to 0.0.2', () => {
      simulatePrMergedOnDefaultBranch(
        branch,
        'cont-cycle-1',
        () => helper.fs.outputFile('comp1/comp1.js', 'console.log("c1");'),
        'feat: cycle 1'
      );
      helper.command.runCmd('bit ci merge --no-bitmap-commit');
      helper.command.status(); // first bit command after the new commit — triggers sync

      expect(bitmapVersion()).to.equal('0.0.2');
    });

    it('cycle 2: same workspace (already-modified .bitmap from cycle 1), syncs to 0.0.3', () => {
      simulatePrMergedOnDefaultBranch(
        branch,
        'cont-cycle-2',
        () => helper.fs.outputFile('comp1/comp1.js', 'console.log("c2");'),
        'feat: cycle 2'
      );
      helper.command.runCmd('bit ci merge --no-bitmap-commit');
      helper.command.status();

      expect(bitmapVersion()).to.equal('0.0.3');
    });

    it('cycle 3: continues advancing without state corruption', () => {
      simulatePrMergedOnDefaultBranch(
        branch,
        'cont-cycle-3',
        () => helper.fs.outputFile('comp1/comp1.js', 'console.log("c3");'),
        'feat: cycle 3'
      );
      helper.command.runCmd('bit ci merge --no-bitmap-commit');
      helper.command.status();

      expect(bitmapVersion()).to.equal('0.0.4');
    });

    it('the sentinel reflects the latest synced HEAD after the chain of cycles', () => {
      const sentinelContent = fs.readFileSync(getSentinelPath(), 'utf-8').trim();
      const currentGitHead = helper.command.runCmd('git rev-parse HEAD').trim();
      expect(sentinelContent).to.equal(currentGitHead);
    });
  });

  // ------------------------------------------------------------------------------------
  // The realistic developer flow: nobody works directly on the default branch. Devs cut
  // a git feature branch, work for a while, then periodically merge main back into it
  // to stay current with their teammates' merged PRs. The "merge main into feature
  // branch" step is exactly when auto-sync needs to fire — that's when newly-tagged
  // versions from other PRs become reachable.
  //
  // Note: this is a *git branch*, not a Bit *lane*. The dev hasn't run `bit lane create`
  // (or `bit ci pr`), so they're still on Bit's main lane — `isOnMain()` returns true
  // and auto-sync is allowed to run.
  // ------------------------------------------------------------------------------------
  describe('developer working on a git feature branch (Bit on main) — merging main in', () => {
    let devClone: string;
    let mainBranch: string;
    const compId = `comp1`;

    function bitmapVersion(): string | undefined {
      const bitmap = helper.bitMap.read();
      const entry = bitmap[compId] || bitmap[`${helper.scopes.remote}/${compId}`];
      return entry?.version;
    }

    before(() => {
      // ── CI workspace setup ──
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      mainBranch = setupComponentsAndInitialCommit();
      enableBitmapAutoSync();
      commitAndPushWorkspaceJsonc(mainBranch);

      // Snapshot the dev workspace BEFORE any teammate activity. This is what the dev
      // had when they branched off main.
      devClone = helper.scopeHelper.cloneWorkspace();

      // Simulate a teammate's PR landing on origin/main while the dev is off on their
      // feature branch — the version bumps to 0.0.2, but bitmap on origin stays at 0.0.1.
      simulatePrMergedOnDefaultBranch(
        mainBranch,
        'teammate-work',
        () => helper.fs.outputFile('comp1/comp1.js', 'console.log("teammate");'),
        'feat: teammate update'
      );
      helper.command.runCmd('bit ci merge --no-bitmap-commit');

      // ── Dev's perspective: switch to the dev clone and create a feature branch ──
      helper.scopeHelper.getClonedWorkspace(devClone);
      helper.command.runCmd('git checkout -b feature/dev-work');

      // Dev does some local work on their branch (no remote tagging here — just code).
      helper.fs.outputFile('comp2/comp2.js', 'console.log("dev local work");');
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "wip: dev work on feature branch"');
    });

    it('before merging main: dev .bitmap is still at the original 0.0.1', () => {
      expect(bitmapVersion()).to.equal('0.0.1');
    });

    describe('dev merges origin/main into their feature branch', () => {
      before(() => {
        helper.command.runCmd(`git fetch origin ${mainBranch}`);
        helper.command.runCmd(`git merge origin/${mainBranch} --no-edit`);
      });

      it('git status shows we are still on the feature branch (Bit lane is still main)', () => {
        const currentBranch = helper.command.runCmd('git branch --show-current').trim();
        expect(currentBranch).to.equal('feature/dev-work');
        const lanes = helper.command.listLanesParsed();
        expect(lanes.currentLane).to.equal('main');
      });

      describe('first bit command on the feature branch after the merge', () => {
        before(() => {
          helper.command.status();
        });

        it('auto-sync runs and updates .bitmap to scope HEAD (0.0.2)', () => {
          expect(bitmapVersion()).to.equal('0.0.2');
        });

        it('sentinel records the feature branch HEAD (the merge commit)', () => {
          const sentinelContent = fs.readFileSync(getSentinelPath(), 'utf-8').trim();
          const currentGitHead = helper.command.runCmd('git rev-parse HEAD').trim();
          expect(sentinelContent).to.equal(currentGitHead);
        });
      });
    });
  });

  // ------------------------------------------------------------------------------------
  // Lane guard: when the developer is on a Bit *lane* (not just a git branch), auto-sync
  // must NOT run. Lanes have their own version flow and reconciling to main's scope HEAD
  // would clobber the lane's component versions. The `isOnMain()` guard handles this;
  // this test pins that behavior down so a future refactor can't regress it.
  // ------------------------------------------------------------------------------------
  // ------------------------------------------------------------------------------------
  // Edge case: the developer never runs a bit command locally. They branch off main, code,
  // commit, push — and the first bit command anywhere is `bit ci pr` running in CI on the
  // newly-opened PR. Meanwhile, since the dev branched off, another teammate's PR merged
  // and `bit ci merge --no-bitmap-commit` advanced scope to 0.0.2; the dev's branch still
  // carries .bitmap@0.0.1.
  //
  // The auto-sync needs to fire during `bit ci pr`'s bootstrap so the lane gets snapped
  // off the latest scope HEAD, not the stale bitmap version.
  // ------------------------------------------------------------------------------------
  describe('first bit command is `bit ci pr` on a stale feature branch', () => {
    let devClone: string;
    let mainBranch: string;
    let prOutput: string;

    before(() => {
      // ── Setup: workspace, autoSync enabled, initial state pushed ──
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      mainBranch = setupComponentsAndInitialCommit();
      enableBitmapAutoSync();
      commitAndPushWorkspaceJsonc(mainBranch);

      // Snapshot — represents the dev workspace before they branch.
      devClone = helper.scopeHelper.cloneWorkspace();

      // Teammate's PR lands on main while the dev is offline; scope advances to 0.0.2.
      simulatePrMergedOnDefaultBranch(
        mainBranch,
        'teammate-merged',
        () => helper.fs.outputFile('comp1/comp1.js', 'console.log("teammate");'),
        'feat: teammate update'
      );
      helper.command.runCmd('bit ci merge --no-bitmap-commit');

      // ── Dev's perspective: branch, code, commit, push — NO bit commands ──
      helper.scopeHelper.getClonedWorkspace(devClone);
      helper.command.runCmd('git checkout -b feature/no-local-bit');
      helper.fs.outputFile('comp1/comp1.js', 'console.log("dev");');
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "feat: dev change"');
      helper.command.runCmd('git push -u origin feature/no-local-bit');

      // The dev's .bitmap on disk here is still 0.0.1 — they never ran a bit command
      // since branching, so auto-sync hasn't fired yet for this workspace state.

      // First bit command in this workspace state is `bit ci pr`. The bootstrap should
      // auto-sync the bitmap to 0.0.2 BEFORE bit ci pr's own logic runs.
      prOutput = helper.command.runCmd('bit ci pr --message "stale-branch PR"');
    });

    it('starts the test with .bitmap reflecting the post-sync version (0.0.2)', () => {
      // Auto-sync rewrote bitmap during `bit ci pr` bootstrap — verify it landed.
      const bitmap = helper.bitMap.read();
      const entry = bitmap['comp1'] || bitmap[`${helper.scopes.remote}/comp1`];
      expect(entry?.version).to.match(/^(0\.0\.2|[a-f0-9]{40})$/); // 0.0.2 from main, or a fresh snap on the lane
    });

    it('bit ci pr completes successfully despite the stale starting state', () => {
      expect(prOutput).to.include('PR command executed successfully');
    });

    it('creates the lane and exports it', () => {
      const remoteLanes = helper.command.listRemoteLanesParsed();
      const lane = remoteLanes.lanes.find((l: any) => l.name === 'feature-no-local-bit');
      expect(lane).to.exist;
      expect(lane.components).to.have.lengthOf(1);
    });

    it('the sentinel was advanced (auto-sync ran during the bit ci pr bootstrap)', () => {
      // bit ci pr eventually switches to a Bit lane internally, but the bootstrap fires
      // BEFORE that switch — at the moment auto-sync is allowed, isOnMain() is still true
      // and the sentinel gets written. Subsequent commands will see it cached.
      expect(getSentinelPath()).to.be.a.file();
    });
  });

  describe('developer on a Bit lane — auto-sync is skipped', () => {
    let mainBranch: string;
    let sentinelBeforeLaneWork: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      mainBranch = setupComponentsAndInitialCommit();
      enableBitmapAutoSync();
      commitAndPushWorkspaceJsonc(mainBranch);

      // Creating the lane is itself a bit command, which runs while we're still on
      // main — so the sentinel is initialized at that moment. Capture it.
      helper.command.createLane('feature-lane');
      sentinelBeforeLaneWork = fs.existsSync(getSentinelPath())
        ? fs.readFileSync(getSentinelPath(), 'utf-8').trim()
        : '';

      // Move git HEAD on the lane so the sentinel-mismatch condition would normally
      // trigger a sync — the lane guard is the only thing that should suppress it.
      helper.fs.outputFile('comp1/comp1.js', 'console.log("on lane");');
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "wip on lane"');

      helper.command.status(); // first bit command on the lane after the new commit
    });

    it('we are on the Bit lane, not main', () => {
      const lanes = helper.command.listLanesParsed();
      expect(lanes.currentLane).to.equal('feature-lane');
    });

    it('sentinel did NOT advance to the lane-side git HEAD (lane guard suppressed sync)', () => {
      const currentGitHead = helper.command.runCmd('git rev-parse HEAD').trim();
      const sentinelAfter = fs.existsSync(getSentinelPath()) ? fs.readFileSync(getSentinelPath(), 'utf-8').trim() : '';
      expect(sentinelAfter).to.equal(sentinelBeforeLaneWork);
      expect(sentinelAfter).to.not.equal(currentGitHead);
    });
  });

  // ------------------------------------------------------------------------------------
  // CLI flag without the workspace flag: `--no-bitmap-commit` alone skips the commit but
  // the auto-sync mechanism is NOT activated. The dev would still need a manual sync.
  // This documents the intentional separation: the CLI flag is for the CI side, the
  // workspace flag is for the dev side.
  // ------------------------------------------------------------------------------------
  describe('--no-bitmap-commit CLI flag without the workspace flag', () => {
    let branch: string;
    let originHeadBefore: string;
    let originHeadAfter: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      branch = setupComponentsAndInitialCommit();
      // Note: NOT calling enableBitmapAutoSync() — the workspace flag is absent.

      simulatePrMergedOnDefaultBranch(
        branch,
        'cli-flag-only',
        () => helper.fs.outputFile('comp1/comp1.js', 'console.log("cli-only");'),
        'feat: cli flag only'
      );

      originHeadBefore = helper.command.runCmd(`git rev-parse origin/${branch}`).trim();
      helper.command.runCmd('bit ci merge --no-bitmap-commit');
      originHeadAfter = helper.command.runCmd(`git rev-parse origin/${branch}`).trim();
    });

    it('should skip the commit (CLI flag works standalone)', () => {
      expect(originHeadAfter).to.equal(originHeadBefore);
    });

    it('should still tag and export to remote scope', () => {
      const list = helper.command.listRemoteScopeParsed();
      const comp1 = list.find((c) => c.id.includes('comp1'));
      expect(comp1?.localVersion).to.equal('0.0.2');
    });

    it('should NOT create a sentinel file (workspace flag is off)', () => {
      // The auto-sync mechanism is gated on the workspace flag. With it off, no sentinel.
      const sentinelPath = getSentinelPath();
      expect(fs.existsSync(sentinelPath)).to.equal(false);
    });
  });

  // ------------------------------------------------------------------------------------
  // Multiple components: every entry in .bitmap auto-syncs to scope HEAD, regardless of
  // which components were source-modified. (`bit ci merge` tags all components by default,
  // and any auto-tagged dependents also bump — auto-sync mirrors whatever scope says.)
  // ------------------------------------------------------------------------------------
  describe('multiple components — all bitmap entries mirror scope HEAD after sync', () => {
    let devClone: string;
    let branch: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      branch = setupComponentsAndInitialCommit(3); // comp1, comp2, comp3
      enableBitmapAutoSync();
      commitAndPushWorkspaceJsonc(branch);

      devClone = helper.scopeHelper.cloneWorkspace();

      simulatePrMergedOnDefaultBranch(
        branch,
        'multi-comp',
        () => {
          helper.fs.outputFile('comp1/comp1.js', 'console.log("c1 updated");');
          helper.fs.outputFile('comp3/comp3.js', 'console.log("c3 updated");');
        },
        'feat: update components'
      );
      helper.command.runCmd('bit ci merge --no-bitmap-commit');

      helper.scopeHelper.getClonedWorkspace(devClone);
      helper.command.runCmd(`git pull origin ${branch}`);
      helper.command.status();
    });

    it('every component in the bitmap should match its scope HEAD', () => {
      const remote = helper.command.listRemoteScopeParsed();
      const local = helper.command.listParsed();
      expect(local.length).to.be.greaterThan(0);
      for (const localComp of local) {
        const remoteComp = remote.find((c) => c.id === localComp.id);
        if (!remoteComp) continue;
        expect(localComp.currentVersion).to.equal(
          remoteComp.localVersion,
          `bitmap version for ${localComp.id} does not match its scope HEAD`
        );
      }
    });

    it('the modified components (comp1, comp3) should be at the new tag (0.0.2)', () => {
      const list = helper.command.listParsed();
      const comp1 = list.find((c) => c.id.includes('comp1'));
      const comp3 = list.find((c) => c.id.includes('comp3'));
      expect(comp1?.currentVersion).to.equal('0.0.2');
      expect(comp3?.currentVersion).to.equal('0.0.2');
    });

    it('status should be clean across all components', () => {
      helper.command.expectStatusToBeClean();
    });
  });

  // ------------------------------------------------------------------------------------
  // Workspace without a git repo: the sentinel/git-HEAD mechanism gracefully degrades.
  // Auto-sync is a no-op; existing behavior is preserved.
  // ------------------------------------------------------------------------------------
  describe('workspace without git: graceful skip', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      // No git init — this workspace is not in a git repository.
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      enableBitmapAutoSync();
    });

    it('bit status should run successfully without erroring on the missing git', () => {
      // Using runCmd directly so we can capture stderr if anything went sideways.
      const output = helper.command.runCmd('bit status');
      expect(output).to.not.match(/error|Error|ENOENT/);
    });

    it('should NOT create a sentinel file when there is no git', () => {
      const sentinelPath = getSentinelPath();
      expect(fs.existsSync(sentinelPath)).to.equal(false);
    });

    it('bit list should report the locally-known version (no sync attempted)', () => {
      const list = helper.command.listParsed();
      const comp1 = list.find((c) => c.id.includes('comp1'));
      expect(comp1?.currentVersion).to.equal('0.0.1');
    });
  });

  // ------------------------------------------------------------------------------------
  // Idempotency: git HEAD changed (e.g. a non-component commit was pulled), so the
  // sentinel mismatch fires the reconciliation, but scope HEAD already matches the
  // bitmap. The sync should be a no-op against `.bitmap` (no rewrite) yet still advance
  // the sentinel so the next command at the same HEAD takes the cached path.
  // ------------------------------------------------------------------------------------
  describe('git HEAD changed but no actual scope-vs-bitmap drift', () => {
    let devClone: string;
    let branch: string;
    let bitmapBeforeSync: Record<string, any>;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      branch = setupComponentsAndInitialCommit();
      enableBitmapAutoSync();
      commitAndPushWorkspaceJsonc(branch);

      devClone = helper.scopeHelper.cloneWorkspace();

      // Push a NON-component change (just docs / a README) so git HEAD moves but no
      // tag/export happens. Critically, no `bit ci merge` is invoked here.
      helper.fs.outputFile('README.md', '# updated docs only\n');
      helper.command.runCmd('git add README.md');
      helper.command.runCmd('git commit -m "docs: update readme"');
      helper.command.runCmd(`git push origin ${branch}`);

      helper.scopeHelper.getClonedWorkspace(devClone);
      bitmapBeforeSync = helper.bitMap.read();
      helper.command.runCmd(`git pull origin ${branch}`);
      helper.command.status(); // should trigger reconcile but be a no-op for bitmap
    });

    it('.bitmap should be byte-identical to before the sync (no spurious rewrites)', () => {
      const bitmapAfterSync = helper.bitMap.read();
      expect(bitmapAfterSync).to.deep.equal(bitmapBeforeSync);
    });

    it('the sentinel should still advance to the current git HEAD', () => {
      const sentinelPath = getSentinelPath();
      expect(sentinelPath).to.be.a.file();
      const sentinelContent = fs.readFileSync(sentinelPath, 'utf-8').trim();
      const currentGitHead = helper.command.runCmd('git rev-parse HEAD').trim();
      expect(sentinelContent).to.equal(currentGitHead);
    });
  });

  // ------------------------------------------------------------------------------------
  // Resilience: when the remote scope path is gone, the workspace's auto-sync degrades
  // gracefully — Bit's importer tolerates a missing remote (the local scope is sufficient
  // for currently-known versions), so the command completes without error and uses
  // whatever local state is available. The user keeps working; nothing crashes.
  // ------------------------------------------------------------------------------------
  describe('graceful degradation when remote scope is unreachable', () => {
    let devClone: string;
    let branch: string;
    let bitmapBeforeCommand: Record<string, any>;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      branch = setupComponentsAndInitialCommit();
      enableBitmapAutoSync();
      commitAndPushWorkspaceJsonc(branch);

      devClone = helper.scopeHelper.cloneWorkspace();

      simulatePrMergedOnDefaultBranch(
        branch,
        'remote-unreachable',
        () => helper.fs.outputFile('comp1/comp1.js', 'console.log("unreachable");'),
        'feat: simulate remote loss'
      );
      helper.command.runCmd('bit ci merge --no-bitmap-commit');

      helper.scopeHelper.getClonedWorkspace(devClone);
      helper.command.runCmd(`git pull origin ${branch}`);

      // Break the remote scope path so importCurrentObjects has nothing to fetch.
      helper.fs.deletePath(helper.scopes.remotePath);
      bitmapBeforeCommand = helper.bitMap.read();
    });

    it('bit status should complete without throwing', () => {
      const output = helper.command.runCmd('bit status');
      expect(output).to.be.a('string');
    });

    it('local .bitmap should not be corrupted by the failed remote', () => {
      // The bitmap should at minimum still contain the components we had before.
      const bitmapAfter = helper.bitMap.read();
      const beforeKeys = Object.keys(bitmapBeforeCommand).filter((k) => !k.startsWith('$'));
      const afterKeys = Object.keys(bitmapAfter).filter((k) => !k.startsWith('$'));
      for (const k of beforeKeys) {
        expect(afterKeys).to.include(k);
      }
    });
  });

  // ------------------------------------------------------------------------------------
  // Combined: the normal `bit ci merge` (without --no-bitmap-commit) still works in a
  // workspace where bitmapAutoSync is enabled. The flags are independent — devs may opt
  // into auto-sync first and migrate the CI side later.
  // ------------------------------------------------------------------------------------
  describe('bitmapAutoSync enabled but legacy `bit ci merge` (commit + push) used', () => {
    let mergeOutput: string;
    let branch: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      branch = setupComponentsAndInitialCommit();
      enableBitmapAutoSync();
      commitAndPushWorkspaceJsonc(branch);

      simulatePrMergedOnDefaultBranch(
        branch,
        'transitional',
        () => helper.fs.outputFile('comp1/comp1.js', 'console.log("transitional");'),
        'feat: transitional path'
      );

      mergeOutput = helper.command.runCmd('bit ci merge --message "transitional"');
    });

    it('legacy commit+push still works when --no-bitmap-commit is omitted', () => {
      expect(mergeOutput).to.include('Merged PR');
      const log = helper.command.runCmd(`git log ${branch} --oneline -n 5`);
      expect(log).to.match(/skip ci|update .bitmap|Bit CI/i);
    });

    it('component is tagged and exported', () => {
      const list = helper.command.listRemoteScopeParsed();
      const comp1 = list.find((c) => c.id.includes('comp1'));
      expect(comp1?.localVersion).to.equal('0.0.2');
    });
  });
});
