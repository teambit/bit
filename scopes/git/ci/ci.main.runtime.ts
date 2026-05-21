import type { RuntimeDefinition } from '@teambit/harmony';
import { CLIAspect, type CLIMain, MainRuntime } from '@teambit/cli';
import { LoggerAspect, type LoggerMain, type Logger } from '@teambit/logger';
import { WorkspaceAspect, type Workspace } from '@teambit/workspace';
import { BuilderAspect, type BuilderMain } from '@teambit/builder';
import { StatusAspect, type StatusMain } from '@teambit/status';
import { LanesAspect } from '@teambit/lanes';
import type { SwitchLaneOptions, LanesMain } from '@teambit/lanes';
import { SnappingAspect, tagResultOutput, snapResultOutput } from '@teambit/snapping';
import type { SnapResults, SnappingMain } from '@teambit/snapping';
import { ExportAspect, type ExportMain } from '@teambit/export';
import { ImporterAspect, type ImporterMain } from '@teambit/importer';
import { CheckoutAspect, checkoutOutput, type CheckoutMain } from '@teambit/checkout';
import { MergeLanesAspect, type MergeLanesMain } from '@teambit/merge-lanes';
import type { MergeStrategy } from '@teambit/component.modules.merge-helper';
import execa from 'execa';
import chalk from 'chalk';
import type { ReleaseType } from 'semver';
import { CiAspect } from './ci.aspect';
import { CiCmd } from './ci.cmd';
import { CiVerifyCmd } from './commands/verify.cmd';
import { CiPrCmd } from './commands/pr.cmd';
import { CiMergeCmd } from './commands/merge.cmd';
import { git } from './git';
import { ComponentIdList } from '@teambit/component-id';
import type { ComponentID } from '@teambit/component-id';
import { isEqual } from 'lodash';
import type { Version, LaneComponent } from '@teambit/objects';
import { Ref } from '@teambit/objects';
import type { LaneId } from '@teambit/lane-id';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import { SourceBranchDetector } from './source-branch-detector';

const LANE_HASH_MISMATCH_MARKER = 'a lane with the same id already exists with a different hash';
export interface CiWorkspaceConfig {
  /**
   * Path to a custom script that generates commit messages for `bit ci merge` operations.
   * The script will be executed when components are tagged and committed to the repository.
   * If not specified, falls back to the default commit message:
   * "chore: update .bitmap and lockfiles as needed [skip ci]"
   *
   * @example
   * ```json
   * {
   *   "teambit.git/ci": {
   *     "commitMessageScript": "node scripts/generate-commit-message.js"
   *   }
   * }
   * ```
   */
  commitMessageScript?: string;

  /**
   * Enables automatic version bump detection from conventional commit messages.
   * When enabled, the system analyzes commit messages to determine the appropriate version bump:
   * - `feat!:` or `BREAKING CHANGE` → major version bump
   * - `feat:` → minor version bump
   * - `fix:` → patch version bump
   *
   * Only applies when no explicit version flags (--patch, --minor, --major) are provided.
   *
   * @default false
   * @example
   * ```json
   * {
   *   "teambit.git/ci": {
   *     "useConventionalCommitsForVersionBump": true
   *   }
   * }
   * ```
   */
  useConventionalCommitsForVersionBump?: boolean;

  /**
   * Enables detection of explicit version bump keywords in commit messages.
   * When enabled, the system looks for these keywords in commit messages:
   * - `BIT-BUMP-MAJOR` → major version bump
   * - `BIT-BUMP-MINOR` → minor version bump
   *
   * These keywords have higher priority than conventional commits parsing.
   * Only applies when no explicit version flags are provided.
   *
   * @default true
   * @example
   * ```json
   * {
   *   "teambit.git/ci": {
   *     "useExplicitBumpKeywords": true
   *   }
   * }
   * ```
   */
  useExplicitBumpKeywords?: boolean;
}

export class CiMain {
  static runtime = MainRuntime as RuntimeDefinition;

  static dependencies: any = [
    CLIAspect,
    WorkspaceAspect,
    LoggerAspect,
    BuilderAspect,
    StatusAspect,
    LanesAspect,
    SnappingAspect,
    ExportAspect,
    ImporterAspect,
    CheckoutAspect,
    MergeLanesAspect,
  ];

  static slots: any = [];

  constructor(
    private workspace: Workspace,

    private builder: BuilderMain,

    private status: StatusMain,

    private lanes: LanesMain,

    private snapping: SnappingMain,

    private exporter: ExportMain,

    private importer: ImporterMain,

    private checkout: CheckoutMain,

    private mergeLanes: MergeLanesMain,

    private logger: Logger,

    private config: CiWorkspaceConfig
  ) {}

  static async provider(
    [cli, workspace, loggerAspect, builder, status, lanes, snapping, exporter, importer, checkout, mergeLanes]: [
      CLIMain,
      Workspace,
      LoggerMain,
      BuilderMain,
      StatusMain,
      LanesMain,
      SnappingMain,
      ExportMain,
      ImporterMain,
      CheckoutMain,
      MergeLanesMain,
    ],
    config: CiWorkspaceConfig
  ) {
    const logger = loggerAspect.createLogger(CiAspect.id);
    const ci = new CiMain(
      workspace,
      builder,
      status,
      lanes,
      snapping,
      exporter,
      importer,
      checkout,
      mergeLanes,
      logger,
      config
    );
    const ciCmd = new CiCmd(workspace, logger);
    ciCmd.commands = [
      new CiVerifyCmd(workspace, logger, ci),
      new CiPrCmd(workspace, logger, ci),
      new CiMergeCmd(workspace, logger, ci),
    ];
    cli.register(ciCmd);

    return ci;
  }

  async getBranchName() {
    try {
      // if we are running on github, use the GITHUB_HEAD_REF env var
      if (process.env.GITHUB_HEAD_REF) return process.env.GITHUB_HEAD_REF;

      const branch = await git.branch();
      return branch.current;
    } catch (e: any) {
      throw new Error(`Unable to read branch: ${e.toString()}`);
    }
  }

  /**
   * Converts a branch name to a lane ID string using Bit's naming conventions.
   * Sanitizes branch name by replacing slashes and dots with dashes, converting to lowercase, then
   * prefixes with the workspace's default scope.
   *
   * @param branchName - The git branch name to convert
   * @returns Lane ID in format: {defaultScope}/{sanitizedBranch}
   * @example convertBranchToLaneId("feature/New-Component") => "my-scope/feature-new-component"
   */
  convertBranchToLaneId(branchName: string): string {
    // Sanitize branch name to make it valid for Bit lane IDs by replacing slashes and dots with dashes
    // and converting to lowercase
    const sanitizedBranch = branchName.replace(/[/.]/g, '-').toLowerCase();
    return `${this.workspace.defaultScope}/${sanitizedBranch}`;
  }

  async getDefaultBranchName() {
    try {
      // Try to get the default branch from git symbolic-ref
      const result = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD']);
      const defaultBranch = result.trim().split('/').pop();
      return defaultBranch || 'master';
    } catch (e: any) {
      // Fallback to common default branch names
      try {
        const branches = await git.branch(['-r']);
        if (branches.all.includes('origin/main')) return 'main';
        if (branches.all.includes('origin/master')) return 'master';
        return 'master'; // Final fallback
      } catch {
        this.logger.console(chalk.yellow(`Unable to detect default branch, using 'master': ${e.toString()}`));
        return 'master';
      }
    }
  }

  async getGitCommitMessage() {
    try {
      const commit = await git.log({
        maxCount: 1,
      });
      if (!commit.latest) {
        return null;
      }
      const { message, body } = commit.latest;
      return body ? `${message}\n\n${body}` : message;
    } catch (e: any) {
      throw new Error(`Unable to read commit message: ${e.toString()}`);
    }
  }

  private parseVersionBumpFromCommit(commitMessage: string): ReleaseType | null {
    // Check explicit bump keywords (highest priority after env vars)
    if (this.config.useExplicitBumpKeywords !== false) {
      // default to true
      if (commitMessage.includes('BIT-BUMP-MAJOR')) {
        this.logger.console(chalk.blue('Found BIT-BUMP-MAJOR keyword in commit message'));
        return 'major';
      }
      if (commitMessage.includes('BIT-BUMP-MINOR')) {
        this.logger.console(chalk.blue('Found BIT-BUMP-MINOR keyword in commit message'));
        return 'minor';
      }
    }

    // Check conventional commits if enabled
    if (this.config.useConventionalCommitsForVersionBump) {
      // Check for breaking changes (major version bump)
      if (/^feat!(\(.+\))?:|^fix!(\(.+\))?:|BREAKING CHANGE/m.test(commitMessage)) {
        this.logger.console(chalk.blue('Found breaking changes in commit message (conventional commits)'));
        return 'major';
      }

      // Check for features (minor version bump)
      if (/^feat(\(.+\))?:/m.test(commitMessage)) {
        this.logger.console(chalk.blue('Found feature commits (conventional commits)'));
        return 'minor';
      }

      // Check for fixes (patch version bump) - explicit patch not needed as it's default
      if (/^fix(\(.+\))?:/m.test(commitMessage)) {
        this.logger.console(chalk.blue('Found fix commits (conventional commits) - using default patch'));
        return 'patch';
      }
    }

    return null; // No specific version bump detected
  }

  private async getCustomCommitMessage() {
    try {
      const commitMessageScript = this.config.commitMessageScript;

      if (commitMessageScript) {
        this.logger.console(chalk.blue(`Running custom commit message script: ${commitMessageScript}`));

        // Parse the command to avoid shell injection
        const parts = commitMessageScript.split(' ');
        const command = parts[0];
        const args = parts.slice(1);

        const result = await execa(command, args, {
          cwd: this.workspace.path,
          encoding: 'utf8',
        });
        const customMessage = result.stdout.trim();

        if (customMessage) {
          this.logger.console(chalk.green(`Using custom commit message: ${customMessage}`));
          return customMessage;
        }
      }
    } catch (e: any) {
      this.logger.console(chalk.yellow(`Failed to run custom commit message script: ${e.toString()}`));
    }

    // Fallback to default message
    return 'chore: update .bitmap and lockfiles as needed [skip ci]';
  }

  private async verifyWorkspaceStatusInternal(strict: boolean = false) {
    this.logger.console('📊 Workspace Status');
    this.logger.console(chalk.blue('Verifying status of workspace'));

    const status = await this.status.status({ lanes: true });
    const { data: statusOutput, code } = await this.status.formatStatusOutput(
      status,
      strict
        ? { strict: true, warnings: true } // When strict=true, fail on both errors and warnings
        : { failOnError: true, warnings: false } // By default, fail only on errors (tag blockers)
    );

    // Log the formatted status output
    this.logger.console(statusOutput);

    if (code !== 0) {
      throw new Error('Workspace status verification failed');
    }

    this.logger.consoleSuccess(chalk.green('Workspace status is correct'));
    return { status };
  }

  private async switchToLane(laneName: string, options: SwitchLaneOptions = {}) {
    this.logger.console(chalk.blue(`Switching to ${laneName}`));
    try {
      await this.lanes.switchLanes(laneName, {
        forceOurs: true,
        workspaceOnly: true,
        skipDependencyInstallation: true,
        ...options,
      });
    } catch (e: any) {
      if (e.toString().includes('already checked out')) {
        this.logger.console(chalk.yellow(`Lane ${laneName} already checked out, skipping checkout`));
        return true;
      }
      this.logger.console(chalk.red(`Failed switching to ${laneName}: ${e.toString()}`));
    }
  }

  /**
   * Merge `main` (the default lane) into the given lane. Brings forward any changes that landed
   * on main since the lane was forked — particularly config changes (env, deps, etc.) that live
   * in Version objects under `.bit/objects` and are NOT visible via the workspace's git checkout.
   *
   * Skips silently if main is at or behind the lane's fork point (nothing to merge).
   */
  private async mergeMainIntoLane(laneId: LaneId) {
    const mainLaneId = this.lanes.getDefaultLaneId();
    this.logger.console(chalk.blue(`Merging ${mainLaneId.toString()} into ${laneId.toString()}`));
    try {
      const result = await this.mergeLanes.mergeLane(mainLaneId, laneId, {
        mergeStrategy: 'theirs' as MergeStrategy,
        skipDependencyInstallation: true,
        skipFetch: false,
        excludeNonLaneComps: true,
        // Don't auto-snap: any lane heads main moved forward become the lane's heads directly,
        // and our subsequent `snap` will create one merge snap that combines the merged state
        // with this PR commit's changes.
        noAutoSnap: true,
      });
      this.logger.console(chalk.green(`Merged ${result.mergedSuccessfullyIds.length} component(s) from main`));
    } catch (e: any) {
      // Surface the merge error rather than silently continuing — if main had config changes
      // that we can't bring in, the PR build won't reflect production config, and that's
      // exactly the bug we're trying to prevent.
      throw new Error(`Failed to merge main into ${laneId.toString()}: ${e?.message || e}`);
    }
  }

  async verifyWorkspaceStatus() {
    await this.verifyWorkspaceStatusInternal();

    this.logger.console('🔨 Build Process');
    const components = await this.workspace.list();

    this.logger.console(chalk.blue(`Building ${components.length} components`));

    const build = await this.builder.build(components);

    build.throwErrorsIfExist();

    this.logger.console(chalk.green('Components built'));

    return { code: 0, data: '' };
  }

  async snapPrCommit({
    laneIdStr,
    message,
    build,
    strict,
    dryRun,
  }: {
    laneIdStr: string;
    message: string;
    build: boolean | undefined;
    strict: boolean | undefined;
    dryRun?: boolean;
  }) {
    this.logger.console(chalk.blue(`Lane name: ${laneIdStr}`));

    const originalLane = await this.lanes.getCurrentLane();

    const laneId = await this.lanes.parseLaneId(laneIdStr);

    await this.verifyWorkspaceStatusInternal(strict);

    await this.importer
      .import({
        ids: [],
        installNpmPackages: false,
        writeConfigFiles: false,
      })
      .catch((e) => {
        throw new Error(`Failed to import components: ${e.toString()}`);
      });

    this.logger.console('🔄 Lane Management');

    // Query the remote (by name, to avoid fetching all lanes) so we know whether to reuse or create
    const existingLanes = await this.lanes.getLanes({ remote: laneId.scope, name: laneId.name }).catch((e) => {
      if (e.toString().includes('was not found')) return [];
      throw new Error(`Failed to check lane ${laneId.toString()}: ${e.toString()}`);
    });
    const laneExists = existingLanes.length > 0;

    let foundErr: Error | undefined;
    try {
      if (laneExists) {
        // Reuse the existing remote lane so that the lane history, lane-based UI edits, and
        // lane-history feature on Bit Cloud all survive across subsequent commits to the same PR.
        // switchToLane fetches the latest lane head from remote.
        this.logger.console(chalk.blue(`Lane ${laneId.toString()} exists on remote, reusing it`));
        await this.switchToLane(laneId.toString());
        // Merge main into the lane so that any config changes that landed on main since the lane
        // was created are reflected on the lane. Without this, subsequent PR commits would build
        // against the stale config captured at fork time — e.g. `bit deps set` / `bit env set`
        // changes that landed on main aren't tracked by git (they live in Version objects under
        // `.bit/objects`), so the workspace's git checkout alone can't surface them.
        await this.mergeMainIntoLane(laneId);
      } else {
        this.logger.console(chalk.blue(`Creating lane ${laneId.toString()}`));
        const createLaneResult = await this.lanes.createLane(laneId.name, {
          scope: laneId.scope,
          forkLaneNewScope: true,
        });
        this.logger.console(chalk.blue(`Created lane ${laneId.toString()} (hash: ${createLaneResult.hash})`));
      }

      const currentLane = await this.lanes.getCurrentLane();
      this.logger.console(chalk.blue(`Current lane: ${currentLane?.name ?? 'main'}`));
      if (currentLane?.name !== laneId.name) {
        throw new Error(`Expected to be on lane ${laneId.name}, but current lane is ${currentLane?.name ?? 'main'}`);
      }

      this.logger.console('📦 Snapping Components');
      const results = await this.snapping.snap({
        message,
        build,
        exitOnFirstFailedTask: true,
      });

      if (!results) {
        this.logger.console(chalk.yellow('No changes detected, nothing to snap'));
        return 'No changes detected, nothing to snap';
      }

      const { snappedComponents }: SnapResults = results;

      const snapOutput = snapResultOutput(results);
      this.logger.console(snapOutput);

      if (dryRun) {
        this.logger.console(chalk.yellow('🏃 Dry-run mode: skipping export'));
        this.logger.console(chalk.green(`Snapped ${snappedComponents.length} component(s) successfully`));
        return snapOutput;
      }

      this.logger.console(chalk.blue(`Exporting ${snappedComponents.length} components`));
      await this.exportWithAdoptOnConflict(laneId, snappedComponents);
    } catch (e: any) {
      foundErr = e;
      throw e;
    } finally {
      if (foundErr) {
        this.logger.console(chalk.red(`Found error: ${foundErr.message}`));
      }
      this.logger.console('🔄 Cleanup');
      const targetLane = originalLane?.name ?? 'main';
      this.logger.console(chalk.blue(`Switching back to ${targetLane}`));

      const currentLane = await this.lanes.getCurrentLane();
      if (currentLane) {
        await this.switchToLane(targetLane);
      } else {
        this.logger.console(chalk.yellow('Already on main, checking out to head'));
        await this.lanes.checkout.checkout({ head: true, skipNpmInstall: true });
      }
    }
  }

  /**
   * Export with a recovery path for the "lane hash mismatch" error caused by a concurrent CI run
   * on the same PR branch. Both runners fork from main with `Lane.create`, which mints a random
   * `sha1(v4())` hash per lane object — so even though the LaneId matches, the lane objects
   * differ. The hub's `sources.mergeLane` rejects the second push.
   *
   * Recovery: adopt-the-winner. The remote lane object (whoever pushed first) becomes
   * canonical. We drop our local lane object, fetch the remote, rebase our snapped Version
   * objects so each one's parent points to the remote head for that component, then swap
   * those rebased Versions in as the new lane heads and re-export. Build artifacts are
   * preserved — only the parent pointers on the Version objects change. Result: both
   * runners' snaps end up chained on a single lane object.
   */
  private async exportWithAdoptOnConflict(laneId: LaneId, snappedComponents: ConsumerComponent[]) {
    try {
      const exportResults = await this.exporter.export();
      this.logger.console(chalk.green(`Exported ${exportResults.componentsIds.length} components`));
      return;
    } catch (e: any) {
      const msg = e?.message || e?.toString() || '';
      if (!msg.includes(LANE_HASH_MISMATCH_MARKER)) throw e;
      this.logger.console(
        chalk.yellow(
          `Lane hash mismatch on "${laneId.toString()}" — likely a concurrent CI push. Adopting the remote lane and rebasing local snaps onto its heads.`
        )
      );
    }

    const snappedHeads = snappedComponents.map((c) => ({
      id: c.id,
      head: Ref.from(c.version as string),
    }));

    await this.rebaseOntoRemoteLane(laneId, snappedHeads);

    this.logger.console(chalk.blue('Retrying export with rebased snaps'));
    const exportResults = await this.exportWithBusyRetry();
    this.logger.console(chalk.green(`Exported ${exportResults.componentsIds.length} components after rebase`));
  }

  /**
   * Wrap `exporter.export()` with retry on the "server is busy" error. The retried export's
   * pending-dir lands behind whichever concurrent client is still in the remote's queue (we
   * arrived second by definition — we're the loser of the original race). The 60s wait inside
   * `export-validate.waitIfNeeded` covers the common case, but on slow CI hosts or large pushes
   * we sometimes time out before the other client finishes its persist. A short sleep + retry
   * here just gives the queue room to drain.
   */
  private async exportWithBusyRetry(maxAttempts = 3) {
    const isBusyErr = (err: any) => (err?.message || err?.toString() || '').includes('server is busy by other exports');
    let lastErr: any;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.exporter.export();
      } catch (e: any) {
        lastErr = e;
        if (!isBusyErr(e)) throw e;
        this.logger.console(
          chalk.yellow(
            `Export attempt ${attempt}/${maxAttempts} blocked by a busy remote queue. Waiting before retrying.`
          )
        );
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      }
    }
    throw lastErr;
  }

  private async rebaseOntoRemoteLane(laneId: LaneId, snappedHeads: Array<{ id: ComponentID; head: Ref }>) {
    const legacyScope = this.workspace.scope.legacyScope;
    const repo = legacyScope.objects;

    // Drop our local lane object so the fetch can bring in the remote one without tripping the
    // "different hash" guard in sources.mergeLane. The Version objects we snapped stay in the
    // scope — only the lane pointer is removed.
    this.logger.console(chalk.blue(`Removing local lane ${laneId.toString()} to make room for the remote one`));
    await this.lanes.removeLanes([laneId.toString()], { remote: false, force: true });

    // Fetch the remote (winning) lane and the Version objects it points at, so we can read
    // the canonical heads we need to rebase onto.
    this.logger.console(chalk.blue(`Fetching remote lane ${laneId.toString()}`));
    const remoteLane = await this.lanes.fetchLaneWithItsComponents(laneId);

    // Rewrite each snapped Version's parent to point at the remote head for that component.
    // Bit's Version objects aren't content-addressed — `_hash` is set once and not derived
    // from content — so we can mutate `parents` in place. The hash stays the same, so the
    // build artifacts referenced from the Version remain valid and the lane's component head
    // doesn't need to be re-pointed. The remote receives the updated Version because our
    // first failed export attempt was rejected *before* writing any files to disk
    // (see `writeObjectsToTheFS` — the LaneId-uniqueness check runs first), so the remote
    // doesn't yet have this hash and won't dedupe-skip it during transfer.
    for (const snap of snappedHeads) {
      const remoteComp = remoteLane.components.find((c) => c.id.isEqualWithoutVersion(snap.id));
      if (!remoteComp) continue; // component is only on our lane, not on the remote — no rebase target
      const remoteHead = remoteComp.head;
      if (snap.head.isEqual(remoteHead)) continue;

      const version = (await repo.load(snap.head)) as Version | undefined;
      if (!version) {
        throw new Error(
          `rebaseOntoRemoteLane: unable to load Version object for ${snap.id.toString()} hash ${snap.head.toString()}`
        );
      }
      if (version.parents.some((p) => p.isEqual(remoteHead))) continue; // already chains correctly

      const beforeParents = version.parents.map((p) => p.toString().slice(0, 9)).join(',');
      this.logger.console(
        chalk.blue(
          `Rebasing ${snap.id.toString()}@${snap.head.toString().slice(0, 9)}: parents [${beforeParents}] → [${remoteHead.toString().slice(0, 9)}]`
        )
      );
      version.parents = [remoteHead];
      repo.add(version);
    }

    // Replace the remote lane's component heads with our snapped Versions. Anything we
    // didn't snap stays as the remote had it.
    //
    // TODO(stale-runner): if two consecutive PR commits trigger two CI runs and the older one
    // finishes last, it will rebase its (older-content) snap on top of the newer one — the
    // newer commit's snap stays in history but the lane head regresses to the older content.
    // The fix needs git-SHA-aware staleness detection (embed `git rev-parse HEAD` in the snap
    // log on creation, compare against the remote head's stored SHA on rebase, abort if our
    // commit is an ancestor of theirs). The prior `isStaleCiRun` (removed in #10300 for
    // SSH-prompt reasons) attempted this via `git fetch`; we'd want a fetch-free variant here.
    const updatedComponents: LaneComponent[] = remoteLane.components.map((c) => {
      const snap = snappedHeads.find((s) => s.id.isEqualWithoutVersion(c.id));
      return snap ? { ...c, head: snap.head } : c;
    });
    // Pick up any components we snapped that aren't on the remote lane yet (newly added on this PR).
    for (const snap of snappedHeads) {
      if (!updatedComponents.some((c) => c.id.isEqualWithoutVersion(snap.id))) {
        updatedComponents.push({ id: snap.id, head: snap.head });
      }
    }
    remoteLane.setLaneComponents(updatedComponents);
    remoteLane.hasChanged = true;
    await legacyScope.lanes.saveLane(remoteLane, { saveLaneHistory: false });

    await repo.persist();

    // Make sure the workspace's current-lane pointer points at the lane we just adopted.
    this.workspace.consumer.setCurrentLane(laneId, true);
    await this.workspace.bitMap.write();
  }

  async mergePr({
    message: argMessage,
    build,
    strict,
    releaseType,
    preReleaseId,
    incrementBy,
    explicitVersionBump,
    verbose,
    versionsFile,
    autoMergeResolve,
    forceTheirs,
    laneName,
    skipPush,
    noBitmapCommit,
  }: {
    message?: string;
    build?: boolean;
    strict?: boolean;
    releaseType: ReleaseType;
    preReleaseId?: string;
    incrementBy?: number;
    explicitVersionBump?: boolean;
    verbose?: boolean;
    versionsFile?: string;
    autoMergeResolve?: MergeStrategy;
    forceTheirs?: boolean;
    laneName?: string;
    skipPush?: boolean;
    noBitmapCommit?: boolean;
  }) {
    // Capture the initial commit SHA before any operations modify the repository
    const initialCommitSha = await git.revparse(['HEAD']);

    const message = argMessage || (await this.getGitCommitMessage());
    if (!message) {
      throw new Error('Failed to get commit message from git. Please provide a message using --message option.');
    }

    const currentLane = await this.lanes.getCurrentLane();
    const laneComponents = currentLane?.components;
    if (currentLane) {
      // this doesn't normally happen. we expect this mergePr to be called from the default branch, which normally checks
      // out to main lane.
      this.logger.console(chalk.blue(`Currently on lane ${currentLane.name}, switching to main`));
      await this.switchToLane('main');
      // this is needed to make sure components that were created on the lane are now available on main.
      // without this, the switch to main above, marks those components as not-available, and won't be tagged later on.
      // don't use the high-level `consumer.resetLaneNew()`, because it deletes the entire local scope.
      const changedIds = this.workspace.consumer.bitMap.resetLaneComponentsToNew();
      if (changedIds.length) {
        const changedIdsList = ComponentIdList.fromArray(changedIds);
        await this.workspace.scope.legacyScope.removeMany(changedIdsList, true);

        await this.workspace.clearCache();
        await this.workspace.bitMap.write('reset lane new');
      }

      this.logger.console(chalk.green('Switched to main lane'));
    }

    // Pull latest changes from remote to ensure we have the most up-to-date .bitmap
    // This prevents issues when multiple PRs are merged in sequence
    const defaultBranch = await this.getDefaultBranchName();
    this.logger.console(chalk.blue(`Pulling latest git changes from ${defaultBranch} branch`));

    // Check if there are any changes to stash before rebasing
    const gitStatus = await git.status();
    const hasChanges = gitStatus.files.length > 0;

    if (hasChanges) {
      this.logger.console(chalk.yellow('Stashing uncommitted changes before rebase'));
      await git.stash(['push', '-u', '-m', 'CI merge temporary stash']);
    }

    await git.pull('origin', defaultBranch, { '--rebase': 'true' });

    if (hasChanges) {
      this.logger.console(chalk.yellow('Restoring stashed changes after rebase'));
      await git.stash(['pop']);
    }

    this.logger.console(chalk.green('Pulled latest git changes'));

    this.logger.console('🔄 Checking out to main head');
    await this.importer.importCurrentObjects();

    const checkoutProps = {
      forceOurs: !forceTheirs && !autoMergeResolve, // only force ours if neither forceTheirs nor autoMergeResolve is specified
      head: true,
      skipNpmInstall: true,
      ...(forceTheirs && { forceTheirs }),
      ...(autoMergeResolve && { mergeStrategy: autoMergeResolve }),
    };
    const checkoutResults = await this.checkout.checkout(checkoutProps);

    await this.workspace.bitMap.write('checkout head');
    this.logger.console(reportToString(checkoutOutput(checkoutResults, checkoutProps)));

    if (laneComponents?.length) {
      await this.restoreLaneConfigChanges(laneComponents);
    }

    // Check for workspace.jsonc conflicts
    if (
      checkoutResults.workspaceConfigUpdateResult?.workspaceDepsConflicts ||
      checkoutResults.workspaceConfigUpdateResult?.workspaceConfigConflictWriteError
    ) {
      this.logger.console(chalk.red('❌ workspace.jsonc conflicts detected during checkout'));
      this.logger.console(chalk.blue('\nTo resolve these conflicts, please run:'));
      this.logger.console(chalk.bold('  bit checkout head'));
      this.logger.console(chalk.gray('\nThis will allow you to manually resolve the conflicts in workspace.jsonc.'));

      throw new Error(
        'Cannot complete CI merge due to workspace.jsonc conflicts. Please run "bit checkout head" and fix the conflicts manually.'
      );
    }

    // Check for conflicts when using manual merge strategy
    if (autoMergeResolve === 'manual' && checkoutResults.leftUnresolvedConflicts) {
      const componentsWithConflicts =
        checkoutResults.components?.filter(
          (c) => c.filesStatus && Object.values(c.filesStatus).some((status) => status === 'manual')
        ) || [];

      const conflictedComponentIds = componentsWithConflicts.map((c) => c.id.toString());

      this.logger.console(chalk.red('❌ Merge conflicts detected during checkout'));
      this.logger.console(chalk.yellow('The following components have conflicts:'));
      conflictedComponentIds.forEach((id) => {
        this.logger.console(chalk.yellow(`  - ${id}`));
      });
      this.logger.console(chalk.blue('\nTo resolve these conflicts, please run:'));
      this.logger.console(chalk.bold('  bit checkout head'));
      this.logger.console(chalk.gray('\nThis will allow you to manually resolve the conflicts.'));

      throw new Error(
        'Cannot complete CI merge due to unresolved conflicts. Please resolve conflicts manually and try again.'
      );
    }

    const { status } = await this.verifyWorkspaceStatusInternal(strict);

    const hasSoftTaggedComponents = status.softTaggedComponents.length > 0;

    this.logger.console('📦 Component Operations');
    this.logger.console(chalk.blue('Tagging components'));
    const finalReleaseType = await this.determineReleaseType(releaseType, explicitVersionBump);
    const tagResults = await this.snapping.tag({
      all: true,
      message,
      build,
      failFast: true,
      persist: hasSoftTaggedComponents,
      releaseType: finalReleaseType,
      preReleaseId,
      incrementBy,
      versionsFile,
    });

    if (tagResults) {
      const tagOutput = tagResultOutput(tagResults);
      this.logger.console(tagOutput);
    } else {
      this.logger.console(chalk.yellow('No components to tag'));
    }

    const hasTaggedComponents = tagResults?.taggedComponents && tagResults.taggedComponents.length > 0;

    if (hasTaggedComponents) {
      this.logger.console(chalk.blue('Exporting components'));
      const exportResult = await this.exporter.export();

      if (exportResult.componentsIds.length > 0) {
        this.logger.console(chalk.green(`Exported ${exportResult.componentsIds.length} component(s)`));
      } else {
        this.logger.console(chalk.yellow('Nothing to export'));
      }

      if (noBitmapCommit) {
        this.logger.console(
          chalk.yellow(
            'Skipping bitmap commit (--no-bitmap-commit flag). The new versions are in scope; no git commit will be created on the default branch.'
          )
        );
        this.logger.console(
          chalk.gray(
            'Developers auto-sync their local .bitmap on the next bit command after `git pull` when `bitmapAutoSync: true` is set in workspace.jsonc.'
          )
        );
      } else {
        await this.commitAndPushBitmapChanges({ verbose, skipPush, defaultBranch });
      }
    } else {
      this.logger.console(chalk.yellow('No components were tagged, skipping export and git operations'));
    }

    this.logger.console(chalk.green('Merged PR'));

    // Enhanced lane cleanup logic
    await this.performLaneCleanup(currentLane, laneName, initialCommitSha);

    return { code: 0, data: '' };
  }

  /**
   * Stage every changed file (post-tag/export the bitmap, lockfiles, and any files
   * touched by `bit checkout head` may differ), commit with the configured message,
   * rebase against origin, and push — unless `skipPush` was passed.
   */
  private async commitAndPushBitmapChanges({
    verbose,
    skipPush,
    defaultBranch,
  }: {
    verbose?: boolean;
    skipPush?: boolean;
    defaultBranch: string;
  }) {
    this.logger.console('🔄 Git Operations');
    await git.addConfig('user.email', 'bit-ci[bot]@bit.cloud');
    await git.addConfig('user.name', 'Bit CI');

    const statusBeforeCommit = await git.status();
    this.logger.console(chalk.blue(`Git status before commit: ${statusBeforeCommit.files.length} files`));
    statusBeforeCommit.files.forEach((file) => {
      this.logger.console(chalk.gray(`  ${file.working_dir}${file.index} ${file.path}`));
    });

    if (verbose && statusBeforeCommit.files.length > 0) {
      try {
        const diff = await git.diff();
        if (diff) {
          this.logger.console(chalk.blue('Git diff before commit:'));
          this.logger.console(diff);
        }
      } catch (error) {
        this.logger.console(chalk.yellow(`Failed to show git diff: ${error}`));
      }
    }

    // Stage everything: `bit checkout head` earlier in the flow may modify files
    // beyond .bitmap and pnpm-lock.yaml, so a narrow `git add` would miss them.
    await git.add(['.']);
    const commitMessage = await this.getCustomCommitMessage();
    await git.commit(commitMessage);

    const statusAfterCommit = await git.status();
    this.logger.console(chalk.blue(`Git status after commit: ${statusAfterCommit.files.length} files`));
    statusAfterCommit.files.forEach((file) => {
      this.logger.console(chalk.gray(`  ${file.working_dir}${file.index} ${file.path}`));
    });

    await git.pull('origin', defaultBranch, { '--rebase': 'true' });
    if (skipPush) {
      this.logger.console(chalk.yellow('Skipping git push (--skip-push flag)'));
      return;
    }
    await git.push('origin', defaultBranch);
  }

  /**
   * Compare lane Version extensions with main Version extensions for each component.
   * Any config differences (e.g. env-set, deps-set) are saved to .bitmap so they survive
   * the switch from lane to main and get included in the subsequent tag.
   */
  private async restoreLaneConfigChanges(laneComponents: LaneComponent[]) {
    const scope = this.workspace.scope.legacyScope;
    const repo = scope.objects;
    let hasChanges = false;

    const activeComponents = laneComponents.filter((c) => !c.isDeleted);
    await Promise.all(
      activeComponents.map(async (laneComp) => {
        const laneVersion = (await repo.load(laneComp.head)) as Version;
        if (!laneVersion) {
          this.logger.console(chalk.yellow(`Warning: could not load Version object for ${laneComp.id.toString()}`));
          return;
        }

        const laneConfig = laneVersion.extensions.toConfigObject();
        if (!laneConfig || Object.keys(laneConfig).length === 0) return;

        // Get main Version for comparison
        let mainConfig: Record<string, any> = {};
        const modelComp = await scope.getModelComponentIfExist(laneComp.id.changeVersion(undefined));
        const mainHead = modelComp?.getHead();
        if (mainHead) {
          const mainVersion = (await repo.load(mainHead)) as Version;
          mainConfig = mainVersion?.extensions.toConfigObject() ?? {};
        }

        for (const [aspectId, config] of Object.entries(laneConfig)) {
          if (!isEqual(config, mainConfig[aspectId])) {
            const updated = this.workspace.bitMap.addComponentConfig(
              laneComp.id,
              aspectId,
              config as Record<string, any>
            );
            if (updated) hasChanges = true;
          }
        }
      })
    );

    if (hasChanges) {
      await this.workspace.bitMap.write('restore lane config');
      await this.workspace.clearCache();
      this.logger.console(chalk.blue('Restored config changes from lane'));
    }
  }

  /**
   * Performs lane cleanup by attempting to detect and delete the source lane
   * after a successful merge, even when running on the main branch
   */
  private async performLaneCleanup(currentLane: any, explicitLaneName?: string, initialCommitSha?: string) {
    this.logger.console('🗑️ Lane Cleanup');

    // If we already have a current lane, use it
    if (currentLane) {
      this.logger.console(chalk.blue(`Found current lane: ${currentLane.name}`));
      const laneId = currentLane.id();
      await this.archiveLane(laneId.toString());
      return;
    }

    // If no current lane but explicit lane name provided, try to delete it
    if (explicitLaneName) {
      this.logger.console(chalk.blue(`Using explicitly provided lane name: ${explicitLaneName}`));
      try {
        const laneId = await this.lanes.parseLaneId(explicitLaneName);
        await this.archiveLane(laneId.toString());
        return;
      } catch (e: any) {
        this.logger.console(chalk.yellow(`Failed to parse lane name '${explicitLaneName}': ${e.message}`));
      }
    }

    // Try to auto-detect source branch/lane name using the dedicated detector
    const sourceBranchDetector = new SourceBranchDetector(this.logger);
    const sourceBranchName = await sourceBranchDetector.getSourceBranchName(initialCommitSha);
    if (!sourceBranchName) {
      this.logger.console(chalk.yellow('No current lane and unable to detect source branch - skipping lane cleanup'));
      return;
    }
    try {
      const laneIdStr = this.convertBranchToLaneId(sourceBranchName);

      this.logger.console(
        chalk.blue(`Attempting to delete lane based on source branch: ${sourceBranchName} -> ${laneIdStr}`)
      );

      const laneId = await this.lanes.parseLaneId(laneIdStr);
      await this.archiveLane(laneId.toString());
    } catch (e: any) {
      this.logger.console(
        chalk.yellow(`Error during lane cleanup for source branch '${sourceBranchName}': ${e.message}`)
      );
    }
  }

  /**
   * Archives (deletes) a lane with proper error handling and logging.
   * @param throwOnError - if true, throws on failure (use for critical operations like pre-export cleanup)
   */
  private async archiveLane(laneId: string, throwOnError = false): Promise<'deleted' | 'not-found' | 'error'> {
    try {
      this.logger.console(chalk.blue(`Archiving lane ${laneId}`));
      // force means to remove the lane even if it was not merged. in this case, we don't care much because main already has the changes.
      const archiveLane = await this.lanes.removeLanes([laneId], { remote: true, force: true });
      if (archiveLane.length) {
        this.logger.console(chalk.green(`Lane '${laneId}' archived successfully`));
        return 'deleted';
      }
      this.logger.console(chalk.yellow(`Failed to archive lane '${laneId}' - no lanes were removed`));
      return 'not-found';
    } catch (e: any) {
      if (e.message?.includes('was not found') || e.toString().includes('was not found')) {
        this.logger.console(chalk.yellow(`Lane '${laneId}' was not found on the remote`));
        return 'not-found';
      }
      this.logger.console(chalk.red(`Error archiving lane '${laneId}': ${e.message}`));
      if (throwOnError) {
        throw new Error(`Failed to delete remote lane '${laneId}': ${e.message}`);
      }
      return 'error';
      // Don't throw the error - lane cleanup is not critical to the merge process
    }
  }

  /**
   * Auto-detect version bump from commit messages if no explicit version bump was provided
   */
  private async determineReleaseType(releaseType: ReleaseType, explicitVersionBump?: boolean): Promise<ReleaseType> {
    if (explicitVersionBump) {
      this.logger.console(chalk.blue(`Using explicit version bump: ${releaseType}`));
      return releaseType;
    }
    // Only auto-detect if user didn't specify any version flags
    const lastCommit = await this.getGitCommitMessage();
    if (!lastCommit) {
      this.logger.console(chalk.blue('No commit message found, using default patch'));
      return releaseType;
    }
    const detectedReleaseType = this.parseVersionBumpFromCommit(lastCommit);
    if (detectedReleaseType) {
      this.logger.console(chalk.green(`Auto-detected version bump: ${detectedReleaseType}`));
      return detectedReleaseType;
    }
    this.logger.console(chalk.blue('No specific version bump detected, using default patch'));
    return releaseType;
  }
}

function reportToString(result: string | { data: string }): string {
  return typeof result === 'string' ? result : result.data;
}

CiAspect.addRuntime(CiMain);
