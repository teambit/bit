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
