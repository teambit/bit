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
import type { MergeStrategy } from '@teambit/component.modules.merge-helper';
import { getDivergeData } from '@teambit/component.snap-distance';
import { ComponentConfigMerger } from '@teambit/config-merger';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
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
import type { Version, LaneComponent, Lane } from '@teambit/objects';
import { Ref } from '@teambit/objects';
import type { LaneId } from '@teambit/lane-id';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import { SourceBranchDetector } from './source-branch-detector';
import { generateRandomStr } from '@teambit/toolbox.string.random';

// Two distinct conflicts can surface from the remote on a concurrent `bit ci pr` race.
// LANE_HASH_MISMATCH fires when both runners called `Lane.create` (the lane didn't exist on
// the remote yet), so they each minted a random `sha1(v4())` hash — `sources.mergeLane` then
// rejects the second push's lane object on hash mismatch.
// COMPONENT_DIVERGENCE fires when the lane already exists (both runners `switchToLane`'d
// and got the same lane hash) but they both snapped the SAME component with DIFFERENT
// content — `mergeLane`'s per-component diverge check collects a `ComponentNeedsUpdate`
// and throws `MergeConflictOnRemote("merge error occurred when exporting the component(s)…")`.
// Both recover through the same adopt-and-rebase path in `rebaseOntoRemoteLane`.
const LANE_HASH_MISMATCH_MARKER = 'a lane with the same id already exists with a different hash';
const COMPONENT_DIVERGENCE_MARKER = 'merge error occurred when exporting';
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

    private logger: Logger,

    private config: CiWorkspaceConfig
  ) {}

  static async provider(
    [cli, workspace, loggerAspect, builder, status, lanes, snapping, exporter, importer, checkout]: [
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
    ],
    config: CiWorkspaceConfig
  ) {
    const logger = loggerAspect.createLogger(CiAspect.id);
    const ci = new CiMain(workspace, builder, status, lanes, snapping, exporter, importer, checkout, logger, config);
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

  /**
   * Returns the caught Error on failure, or undefined on success (including the "already checked
   * out" no-op case). Callers that need to react to a specific failure mode (e.g. stale lane) can
   * inspect the returned error; existing callers ignore it and rely on a follow-up
   * `getCurrentLane()` check.
   */
  private async switchToLane(laneName: string, options: SwitchLaneOptions = {}): Promise<Error | undefined> {
    this.logger.console(chalk.blue(`Switching to ${laneName}`));
    try {
      await this.lanes.switchLanes(laneName, {
        forceOurs: true,
        workspaceOnly: true,
        skipDependencyInstallation: true,
        ...options,
      });
    } catch (e: any) {
      if (e?.toString().includes('already checked out')) {
        this.logger.console(chalk.yellow(`Lane ${laneName} already checked out, skipping checkout`));
        return undefined;
      }
      this.logger.console(chalk.red(`Failed switching to ${laneName}: ${e?.toString() ?? e}`));
      return e;
    }
    return undefined;
  }

  /**
   * Sync *config-only* changes from main onto the lane — without a full `bit lane merge`.
   *
   * In this workflow git is the source of truth for files: the PR author merges the default branch
   * into their PR branch, so source changes arrive via git. The one thing git can't carry is
   * config that's already been *tagged into objects* on main — e.g. another PR ran `bit env set` /
   * `bit deps set`; those records lived in `.bitmap`, rode git into main, and `bit ci merge` baked
   * them into the component's Version (clearing them from `.bitmap`). A long-running PR's lane
   * would otherwise miss them.
   *
   * A full lane merge is the wrong tool here: it does a 3-way *file* merge and refuses to run while
   * the workspace has modified components — but in `bit ci pr` the workspace is always dirty (the
   * PR's changes, not yet snapped). So instead we do a per-component 3-way merge of the aspect
   * *config only* (base = common ancestor, ours = lane, theirs = main), keeping the PR's config on
   * conflict, and stash the result on an `unmergedComponents` entry's `mergedConfig`. The
   * subsequent `snap` reads it (via the aspects-merger on component load) and bakes main's config
   * into the new snap, while the snap's files still come from the workspace (git). No file
   * checkout, so no clean-workspace requirement.
   */
  private async syncConfigFromMain(laneId: LaneId) {
    const legacyScope = this.workspace.scope.legacyScope;
    const repo = legacyScope.objects;
    const mainLaneId = this.lanes.getDefaultLaneId();
    const currentLane = await this.lanes.getCurrentLane();
    if (!currentLane) return;
    const workspaceIds = this.workspace.listIds();

    this.logger.console(chalk.blue(`Syncing config changes from ${mainLaneId.toString()} into ${laneId.toString()}`));

    const syncedIds: ComponentID[] = [];
    for (const laneComp of currentLane.components) {
      try {
        const modelComponent = await legacyScope.getModelComponent(laneComp.id);
        const mainHead = modelComponent.head; // the component's head on main
        if (!mainHead) continue; // component isn't on main — nothing to sync from there
        const laneHead = laneComp.head;
        if (mainHead.isEqual(laneHead)) continue; // lane already points at main's head

        const divergeData = await getDivergeData({
          repo,
          modelComponent,
          sourceHead: laneHead,
          targetHead: mainHead,
          throws: false,
        });
        // Only sync when main has snaps the lane doesn't (target ahead, or diverged). If the lane
        // is ahead-only / equal there's nothing on main to bring in.
        if (!divergeData.isTargetAhead() && !divergeData.isDiverged()) continue;

        const currentVersion = await modelComponent.loadVersion(laneHead.toString(), repo);
        const otherVersion = await modelComponent.loadVersion(mainHead.toString(), repo);
        // base = common ancestor. When the lane is strictly behind main (no divergence) the common
        // ancestor IS the lane head, so the lane's own aspects serve as the base.
        const baseSnap = divergeData.commonSnapBeforeDiverge;
        const baseVersion = baseSnap ? await modelComponent.loadVersion(baseSnap.toString(), repo) : currentVersion;

        const configMerger = new ComponentConfigMerger(
          laneComp.id.toStringWithoutVersion(),
          workspaceIds,
          undefined, // merging from main (the default lane) — there's no Lane object for it
          currentVersion.extensions,
          baseVersion.extensions,
          otherVersion.extensions,
          laneId.toString(),
          mainLaneId.toString(),
          this.logger,
          'ours' as MergeStrategy // keep the PR's config on a genuine conflict
        );
        const mergedConfig = configMerger.merge().getSuccessfullyMergedConfig();
        if (!mergedConfig || !Object.keys(mergedConfig).length) continue;

        // Strip dependency deletion markers (version: '-'); the aspects-merger applies mergedConfig
        // as-is, so a leftover '-' would land in the policy.
        this.filterDeletedDependenciesFromConfig(mergedConfig);

        // Upsert: addEntry throws if an entry for this component already exists. A prior
        // --keep-lane run that crashed mid-snap (or otherwise left unmerged.json entries behind)
        // would otherwise make every later run throw here, skip the component, and keep serving
        // stale config. Remove any existing entry first so repeated runs converge on main's latest.
        legacyScope.objects.unmergedComponents.removeComponent(laneComp.id);
        legacyScope.objects.unmergedComponents.addEntry({
          id: { scope: laneComp.id.scope, name: laneComp.id.fullName },
          head: mainHead,
          laneId: mainLaneId,
          mergedConfig,
        });
        syncedIds.push(laneComp.id);
        this.logger.console(
          chalk.blue(
            `  ${laneComp.id.toStringWithoutVersion()}: applying main's config (${Object.keys(mergedConfig).join(', ')})`
          )
        );
      } catch (e: any) {
        // Best-effort per component: one component's config-merge quirk shouldn't abort the whole
        // `bit ci pr`. Log and move on — the build just won't reflect that component's main-side
        // config this run.
        this.logger.console(
          chalk.yellow(`  ${laneComp.id.toStringWithoutVersion()}: skipping config sync from main (${e?.message || e})`)
        );
      }
    }

    if (!syncedIds.length) {
      this.logger.console(chalk.blue('No config changes from main to sync'));
      return;
    }
    await legacyScope.objects.unmergedComponents.write();
    // The components were already loaded (and their aspects cached) earlier in this run, before the
    // unmergedComponents entries existed. Clear the cache so the upcoming `snap` reloads them and
    // the aspects-merger folds in the synced `mergedConfig`.
    this.workspace.clearAllComponentsCache();
    this.logger.console(chalk.green(`Synced config from main for ${syncedIds.length} component(s)`));
  }

  /**
   * Copied from `merging.main.runtime` (`filterDeletedDependenciesFromConfig`): the config merge
   * can emit deletion markers (`version: '-'`) for deps removed on main. The aspects-merger applies
   * `mergedConfig` verbatim, so strip those here to avoid writing a policy entry with version '-'.
   */
  private filterDeletedDependenciesFromConfig(mergeConfig?: Record<string, any>): void {
    const policy: Record<string, Array<{ version?: string }>> | undefined =
      mergeConfig?.[DependencyResolverAspect.id]?.policy;
    if (!policy) return;
    Object.keys(policy).forEach((depType) => {
      const filtered = policy[depType].filter((dep) => dep.version !== '-');
      if (filtered.length === 0) delete policy[depType];
      else policy[depType] = filtered;
    });
  }

  /**
   * Best-effort, fetch-free check for whether the current (PR) branch is *behind* the default
   * branch — i.e. the default branch has commits the PR branch doesn't contain.
   *
   * We intentionally do NOT `git fetch` here (a fetch in CI can hang on an interactive SSH
   * host-key prompt — that's why `isStaleCiRun` was removed in #10300). We compare against
   * whatever `origin/<default>` ref the checkout already has, which reflects the state the default
   * branch was in when this CI run started — exactly the reference point we care about.
   *
   * Returns true only when we can *confirm* the branch is behind. If the ref can't be resolved or
   * anything else goes wrong, returns false (treat as "not behind" / proceed) so we never silently
   * disable the main→lane config propagation.
   */
  private async isBranchBehindDefaultBranch(): Promise<boolean> {
    try {
      const defaultBranch = await this.getDefaultBranchName();
      const defaultRefSha = (await git.revparse([`refs/remotes/origin/${defaultBranch}`])).trim();
      const headSha = (await git.revparse(['HEAD'])).trim();
      if (defaultRefSha === headSha) return false; // identical → up to date
      // We deliberately do NOT use `merge-base --is-ancestor`: it reports the answer via exit code
      // (0 = ancestor, 1 = not), but simple-git's `raw` resolves rather than rejects on exit code
      // 1, so the "not an ancestor" case was silently read as "is an ancestor" — the behind check
      // never fired. Instead compute the merge-base and compare: `merge-base(A, B) === A` iff A is
      // an ancestor of B. When origin/<default> is an ancestor of HEAD the PR already contains it
      // (not behind); otherwise the default branch has commits HEAD doesn't (behind).
      const mergeBase = (await git.raw(['merge-base', defaultRefSha, headSha])).trim();
      return mergeBase !== defaultRefSha;
    } catch (err: any) {
      this.logger.console(
        chalk.yellow(
          `Could not determine whether the PR branch is up to date with the default branch ` +
            `(proceeding as if up to date): ${err?.message || err}`
        )
      );
      return false;
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
    keepLane,
    skipCleanup,
  }: {
    laneIdStr: string;
    message: string;
    build: boolean | undefined;
    strict: boolean | undefined;
    dryRun?: boolean;
    keepLane?: boolean;
    skipCleanup?: boolean;
  }) {
    // The post-export cleanup switches the workspace back to main, which re-checks-out main's HEAD
    // and re-imports every workspace component — pointless when the workspace is about to be
    // discarded. It's opt-in via `--skip-cleanup` (the `bit_pr` CI job passes it) rather than
    // auto-detected from `process.env.CI`: other CI contexts *reuse* the workspace after `bit ci pr`
    // (e.g. the e2e suite, which then tags/asserts on main), and must keep restoring it.
    const resolvedSkipCleanup = Boolean(skipCleanup);
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

    // `--keep-lane` opts into reusing the same remote lane across subsequent commits to a PR, so
    // the lane's history and any lane-based UI edits on Bit Cloud survive. Without it we use the
    // default, battle-tested flow: snap onto a throwaway temp lane and delete+recreate the final
    // lane at export time (the lane is recreated on every PR commit).
    if (keepLane) {
      return this.snapAndExportReusingLane({
        laneId,
        originalLane,
        message,
        build,
        dryRun,
        skipCleanup: resolvedSkipCleanup,
      });
    }
    return this.snapAndExportWithTempLane({
      laneId,
      originalLane,
      message,
      build,
      dryRun,
      skipCleanup: resolvedSkipCleanup,
    });
  }

  /**
   * Post-export cleanup: restore the workspace to the original lane / main so an interactive
   * `bit ci pr` leaves you where you started. `switchToLane('main')` re-checks-out main's HEAD,
   * which re-imports every workspace component — on a large monorepo that's minutes of work for a
   * workspace that, in CI, is thrown away the moment the command exits. Hence `skipCleanup`.
   * Wrapped so a restore failure only warns instead of throwing out of the caller's `finally` and
   * masking the real error from snap/export. Returns whether the switch actually ran (callers use
   * it to decide whether follow-up lane bookkeeping that assumes we left the lane is safe).
   */
  private async restoreWorkspaceAfterPr(originalLane: Lane | undefined, skipCleanup: boolean): Promise<boolean> {
    this.logger.console('🔄 Cleanup');
    if (skipCleanup) {
      this.logger.console(
        chalk.yellow('Skipping workspace restore (--skip-cleanup) — leaving the workspace on the PR lane')
      );
      return false;
    }
    const targetLane = originalLane?.name ?? 'main';
    this.logger.console(chalk.blue(`Switching back to ${targetLane}`));
    const longProcessLogger = this.logger.createLongProcessLogger(`restoring workspace to ${targetLane}`);
    try {
      const currentLane = await this.lanes.getCurrentLane();
      if (currentLane) {
        // switchToLane catches its own errors and *returns* them (never throws), so a failed switch
        // would otherwise slip through as a success. Treat a returned error as "did not switch" so
        // callers don't run follow-up bookkeeping (e.g. temp-lane removal) while still on the lane.
        const switchErr = await this.switchToLane(targetLane);
        if (switchErr) {
          this.logger.consoleWarning(`Cleanup after PR snap failed: ${switchErr.message}`);
          return false;
        }
      } else {
        this.logger.console(chalk.yellow('Already on main, checking out to head'));
        await this.lanes.checkout.checkout({ head: true, skipNpmInstall: true });
      }
      return true;
    } catch (cleanupErr: any) {
      this.logger.consoleWarning(`Cleanup after PR snap failed: ${cleanupErr.message}`);
      return false;
    } finally {
      longProcessLogger.end();
    }
  }

  /**
   * `--keep-lane` flow: reuse the existing remote lane (or create it on the first run), merge main
   * into it to pick up config changes that landed since the fork, snap, and export with
   * adopt-on-conflict recovery for concurrent CI pushes. The lane object is preserved across PR
   * commits, so its history and lane-based UI edits on Bit Cloud survive.
   */
  private async snapAndExportReusingLane({
    laneId,
    originalLane,
    message,
    build,
    dryRun,
    skipCleanup,
  }: {
    laneId: LaneId;
    originalLane: Lane | undefined;
    message: string;
    build: boolean | undefined;
    dryRun?: boolean;
    skipCleanup: boolean;
  }) {
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
        const switchErr = await this.switchToLane(laneId.toString());
        // switchToLane returns the caught error (undefined on success). Combine with a
        // current-lane-state probe — comparing BOTH name AND scope, so a same-named lane in a
        // different scope can't masquerade as a successful switch.
        const switchedLane = await this.lanes.getCurrentLane();
        const landedOnLane = switchedLane?.name === laneId.name && switchedLane?.scope === laneId.scope;
        if (landedOnLane) {
          // Sync config-only changes from main onto the lane, so config that was tagged into
          // objects on main since the lane forked (e.g. `bit deps set` / `bit env set` from
          // another PR, not visible via the workspace's git checkout) is reflected on the lane.
          // Source files are git's job — see syncConfigFromMain.
          //
          // BUT only when the PR branch is actually up to date with the default branch. If the PR
          // is behind (hasn't pulled main's latest), its git checkout still reflects the older
          // fork point, so pulling main's newer config onto the lane would desync the lane from
          // the source. The author merges the default branch into their PR in git; the next
          // `bit ci pr` then propagates it here.
          if (await this.isBranchBehindDefaultBranch()) {
            this.logger.console(
              chalk.yellow(
                `PR branch is behind the default branch — skipping config sync from main. ` +
                  `Merge or rebase the default branch into your PR to pick up main's latest config.`
              )
            );
          } else {
            await this.syncConfigFromMain(laneId);
          }
        } else {
          // Switch failed even though the remote lane exists. The destructive recovery below
          // (delete the remote lane + recreate fresh) is safe only when the failure is the
          // specific "stale lane" pattern — the lane references a ModelComponent the PR has
          // since removed/renamed (`unable to merge lane …, the component … was not found`).
          // For any other failure (transient network blip during fetch, auth error, lane locked
          // by Cloud UI, etc.) destroying lane history would be the wrong response, so we
          // rethrow and let the caller report the real cause.
          const errMsg = switchErr?.toString() ?? '';
          const isStaleLane = errMsg.includes('unable to merge lane');
          if (!isStaleLane) {
            throw new Error(
              `Failed to switch to remote lane ${laneId.toString()}: ${errMsg || '(no error captured)'}. ` +
                `Refusing destructive recovery for this failure class — the error doesn't match the ` +
                `stale-lane marker, so deleting the lane could destroy real history. Investigate or retry.`
            );
          }
          this.logger.console(
            chalk.yellow(
              `Stale remote lane ${laneId.toString()} — switching failed. ` +
                `Deleting it and creating a fresh lane to recover.`
            )
          );
          // Re-check the remote lane's hash immediately before deleting. The central-hub delete
          // API is name-based — there's no compare-and-swap — so two CI jobs racing the same
          // recovery could otherwise have job B delete job A's freshly-recreated lane. By
          // re-fetching here we shrink the TOCTOU window to milliseconds: if A's recreate landed
          // before our re-fetch, the hash changed and we skip the delete entirely. The downstream
          // export then hits the lane-hash mismatch and lands in `exportWithAdoptOnConflict`,
          // which rebases our snaps onto the winner's lane — no destroyed history.
          const staleHash = existingLanes[0]?.hash;
          const recheck = await this.lanes.getLanes({ remote: laneId.scope, name: laneId.name }).catch(() => []);
          const currentRemoteHash = recheck[0]?.hash;
          const remoteChanged = staleHash && currentRemoteHash && currentRemoteHash !== staleHash;
          if (remoteChanged) {
            this.logger.console(
              chalk.blue(
                `Remote lane ${laneId.toString()} changed since we first checked (hash ` +
                  `${staleHash.slice(0, 9)} → ${currentRemoteHash.slice(0, 9)}) — another concurrent ` +
                  `recovery already recreated it. Skipping the delete; export will adopt-on-conflict.`
              )
            );
          } else {
            await this.lanes.removeLanes([laneId.toString()], { remote: true, force: true }).catch((e) => {
              const msg = e?.toString() ?? '';
              // Tolerate the race where another concurrent recovery deleted the lane first — the
              // desired post-condition (lane gone from remote) is already met.
              if (msg.includes('was not found') || msg.includes('not found')) {
                this.logger.console(chalk.blue(`Remote lane ${laneId.toString()} was already gone — proceeding`));
                return;
              }
              throw new Error(`Failed to delete stale remote lane ${laneId.toString()}: ${msg || e}`);
            });
          }
          // switchToLane fetched the remote lane and persisted it into the local scope's lane
          // index (via `importLaneObject` → `legacyScope.lanes.saveLane`) BEFORE the underlying
          // merge failed. Without dropping that local copy here, the upcoming `createLane` would
          // hit the "lane … already exists" guard in create-lane.ts. Same trash-the-local-object
          // pattern as `rebaseOntoRemoteLane`.
          const legacyScope = this.workspace.scope.legacyScope;
          const localLane = await legacyScope.loadLane(laneId);
          if (localLane) {
            await legacyScope.objects.moveObjectsToTrash([localLane.hash()]);
          }
          // Reset the workspace's current-lane pointer to main before createLane, so the new lane
          // is forked from main with an empty component list. `createLane` populates new lanes
          // from `consumer.getCurrentLaneObject()` regardless of `forkLaneNewScope` (which only
          // suppresses the cross-scope guard) — if `originalLane` is non-default (a developer
          // running `bit ci pr` from a lane), without this reset the "fresh" lane would silently
          // inherit `originalLane`'s components. Check the return value: a silent failure here
          // would defeat the whole point of the reset.
          const resetErr = await this.switchToLane('main');
          const afterReset = await this.lanes.getCurrentLane();
          if (resetErr || afterReset) {
            throw new Error(
              `Failed to reset to main before recreating ${laneId.toString()}: ` +
                `${resetErr?.toString() ?? `(still on lane "${afterReset?.name}")`}. ` +
                `Aborting to avoid silently forking the recreated lane from the wrong source.`
            );
          }
          const createLaneResult = await this.lanes.createLane(laneId.name, {
            scope: laneId.scope,
            forkLaneNewScope: true,
          });
          this.logger.console(chalk.blue(`Recreated lane ${laneId.toString()} (hash: ${createLaneResult.hash})`));
        }
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
      await this.restoreWorkspaceAfterPr(originalLane, skipCleanup);
    }
  }

  /**
   * Default flow: snap onto a uniquely-named temporary lane, then at export time delete any
   * existing remote lane and rename the temp lane to the final name. The temp name minimizes the
   * race window when multiple CI jobs run concurrently on the same branch. Trade-off: the final
   * lane is recreated on every PR commit, so its history and any lane-based UI edits on Bit Cloud
   * don't survive across commits — use `--keep-lane` for that.
   */
  private async snapAndExportWithTempLane({
    laneId,
    originalLane,
    message,
    build,
    dryRun,
    skipCleanup,
  }: {
    laneId: LaneId;
    originalLane: Lane | undefined;
    message: string;
    build: boolean | undefined;
    dryRun?: boolean;
    skipCleanup: boolean;
  }) {
    // Use unique temp lane name to avoid race conditions when multiple CI jobs run concurrently
    const tempLaneName = `${laneId.name}-${generateRandomStr(5)}`;

    let foundErr: Error | undefined;
    let renamedToFinalName = false;
    try {
      const createLaneResult = await this.lanes.createLane(tempLaneName, {
        scope: laneId.scope,
        forkLaneNewScope: true,
      });
      this.logger.console(
        chalk.blue(`Created temporary lane ${laneId.scope}/${tempLaneName} (hash: ${createLaneResult.hash})`)
      );

      const currentLane = await this.lanes.getCurrentLane();

      this.logger.console(chalk.blue(`Current lane: ${currentLane?.name ?? 'main'}`));

      if (currentLane?.name !== tempLaneName) {
        throw new Error(
          `Expected to be on lane ${tempLaneName} after creation, but current lane is ${currentLane?.name ?? 'main'}`
        );
      }

      this.logger.console('📦 Snapping Components');
      const results = await this.snapping.snap({
        message,
        build,
        exitOnFirstFailedTask: true,
      });

      if (!results) {
        // No changes to snap - switch back to main and remove the temp lane we created
        this.logger.console(chalk.yellow('No changes detected, removing temporary lane'));
        await this.switchToLane(originalLane?.name ?? 'main');
        await this.lanes.removeLanes([tempLaneName], { remote: false, force: true });
        return 'No changes detected, nothing to snap';
      }

      const { snappedComponents }: SnapResults = results;

      const snapOutput = snapResultOutput(results);
      this.logger.console(snapOutput);

      if (dryRun) {
        this.logger.console(chalk.yellow('🏃 Dry-run mode: skipping export, lane deletion, and rename'));
        this.logger.console(chalk.green(`Snapped ${snappedComponents.length} component(s) successfully`));
        this.logger.console(
          chalk.blue(
            `Temporary lane "${laneId.scope}/${tempLaneName}" kept for debugging. Remove it with: bit lane remove ${laneId.scope}/${tempLaneName}`
          )
        );
        return snapOutput;
      }

      // Finalize atomically: delete existing lane, rename temp lane, export
      this.logger.console('🔄 Finalizing Lane');

      // Check if original lane exists on remote and delete it (query by name to avoid fetching all lanes)
      const existingLanes = await this.lanes.getLanes({ remote: laneId.scope, name: laneId.name }).catch((e) => {
        // Lane not found is expected on first run - just means nothing to delete
        if (e.toString().includes('was not found')) {
          return [];
        }
        throw new Error(`Failed to check lane ${laneId.toString()}: ${e.toString()}`);
      });

      if (existingLanes.length) {
        this.logger.console(chalk.blue(`Deleting existing remote lane ${laneId.toString()}`));
        const archiveResult = await this.archiveLane(laneId.toString(), true); // throwOnError: delete must succeed before export
        if (archiveResult === 'not-found') {
          // `getLanes` just reported the lane exists, but the delete API says "not found". Re-query
          // to confirm. If the lane still shows up, something is off on the remote (delete can't
          // see what list/export can), and retrying will never converge.
          let stillExists;
          try {
            stillExists = await this.lanes.getLanes({ remote: laneId.scope, name: laneId.name });
          } catch (verifyErr: any) {
            throw new Error(
              `failed to verify whether remote lane ${laneId.toString()} still exists after delete returned "not found": ${verifyErr?.message || verifyErr}`
            );
          }
          if (stillExists.length) {
            throw new Error(
              `unable to delete remote lane ${laneId.toString()}: the remote reports the lane as "not found" from ` +
                `the delete API but still lists it from the query API. maybe this is a remote issue on bit.cloud. ` +
                `please contact support or manually delete the lane on bit.cloud before re-running CI.`
            );
          }
        }
      }

      // Rename temp lane to original name
      this.logger.console(chalk.blue(`Renaming lane from ${tempLaneName} to ${laneId.name}`));
      await this.lanes.rename(laneId.name, tempLaneName);
      renamedToFinalName = true;

      // Export with the correct name. Retry on hash-mismatch, which indicates a concurrent CI job
      // pushed the same lane id between our pre-export delete and our merge on the hub.
      this.logger.console(chalk.blue(`Exporting ${snappedComponents.length} components`));
      const exportResults = await this.exportWithRetryOnLaneHashMismatch(laneId.toString());
      this.logger.console(chalk.green(`Exported ${exportResults.componentsIds.length} components`));
    } catch (e: any) {
      foundErr = e;
      throw e;
    } finally {
      if (foundErr) {
        this.logger.console(chalk.red(`Found error: ${foundErr.message}`));
      }
      const switchedBack = await this.restoreWorkspaceAfterPr(originalLane, skipCleanup);

      // Clean up orphaned temporary lane on error. Skip if the rename to the final name already
      // happened - in that case the temp name no longer exists locally, and the lane under the
      // final name may have been partially exported; leave it alone rather than wipe evidence.
      // Also requires having switched off the temp lane first — you can't remove the lane you're
      // currently on, so when the restore was skipped, leave the (local, soon-discarded) temp lane.
      if (switchedBack && foundErr && !renamedToFinalName) {
        const tempLaneFullName = `${laneId.scope}/${tempLaneName}`;
        this.logger.console(chalk.blue(`Cleaning up temporary lane ${tempLaneFullName}`));
        try {
          await this.lanes.removeLanes([tempLaneFullName], { remote: false, force: true });
          this.logger.console(chalk.green(`Removed temporary lane ${tempLaneFullName}`));
        } catch (cleanupErr: any) {
          // Ignore cleanup errors to avoid masking the original error
          this.logger.console(chalk.yellow(`Failed to clean up temporary lane: ${cleanupErr?.message || cleanupErr}`));
        }
      }
    }
  }

  /**
   * Export with a recovery path for the two concurrent-CI conflicts that can surface from the
   * remote (see the marker constants at the top of the file): lane-hash mismatch (both runners
   * created fresh lane objects when the lane didn't yet exist on the remote) and per-component
   * divergence (both reused the existing lane but snapped the same component with different
   * content).
   *
   * Recovery: adopt-the-winner. The remote lane (whoever pushed first) becomes canonical. We
   * drop our local lane object, fetch the remote, rebase our snapped Version objects so each
   * one's parent points to the remote head for that component, then swap those rebased Versions
   * in as the new lane heads and re-export. Build artifacts are preserved — only the parent
   * pointers on the Version objects change. Result: both runners' snaps end up chained on a
   * single lane object (last-writer-wins on content for any contested component, with the
   * winner's snap preserved in history as the parent).
   */
  private async exportWithAdoptOnConflict(laneId: LaneId, snappedComponents: ConsumerComponent[]) {
    try {
      const exportResults = await this.exporter.export();
      this.logger.console(chalk.green(`Exported ${exportResults.componentsIds.length} components`));
      return;
    } catch (e: any) {
      const msg = e?.message || e?.toString() || '';
      const isLaneHashMismatch = msg.includes(LANE_HASH_MISMATCH_MARKER);
      const isComponentDivergence = msg.includes(COMPONENT_DIVERGENCE_MARKER);
      if (!isLaneHashMismatch && !isComponentDivergence) throw e;
      const cause = isLaneHashMismatch ? 'Lane hash mismatch' : 'Per-component divergence';
      this.logger.console(
        chalk.yellow(
          `${cause} on "${laneId.toString()}" — likely a concurrent CI push. Adopting the remote lane and rebasing local snaps onto its heads.`
        )
      );
    }

    const snappedHeads = snappedComponents.map((c) => {
      // A just-snapped component always has a version; guard defensively so a missing one fails
      // with a clear message instead of `Ref.from(undefined)`'s opaque "hash argument is empty".
      if (!c.version) {
        throw new Error(
          `unable to recover from the lane-hash mismatch: snapped component "${c.id.toString()}" has no version to rebase onto the remote lane`
        );
      }
      return { id: c.id, head: Ref.from(c.version) };
    });

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

    // Our local lane object (the one we just snapped onto) shares the LaneId with the remote
    // (winning) lane but has a different, randomly-minted hash. Fetching the remote lane writes it
    // into our scope via `sources.mergeLane`, which rejects a same-id/different-hash lane ("a lane
    // with the same id already exists with a different hash") — so we must drop our local lane
    // object BEFORE the fetch, not after. We can't use `lanes.removeLanes` (it refuses to remove
    // the currently-checked-out lane), so we trash the lane object directly; that also removes it
    // from the scope index, so `loadLane` (the guard's lookup) no longer finds it. Only the lane
    // pointer is trashed — the Version objects we snapped stay in the scope for the rebase below,
    // and the fetch immediately re-persists a same-id lane object, satisfying the current-lane
    // workspace pointer again.
    const localLane = await legacyScope.loadLane(laneId);
    if (localLane) {
      this.logger.console(chalk.blue(`Dropping local lane object ${laneId.toString()} to adopt the remote one`));
      await repo.moveObjectsToTrash([localLane.hash()]);
    }

    // Fetch the remote (winning) lane and the Version objects it points at. With our local lane
    // object gone, `mergeLane` sees no conflicting same-id lane and persists the remote one.
    this.logger.console(chalk.blue(`Fetching remote lane ${laneId.toString()}`));
    const remoteLane = await this.lanes.fetchLaneWithItsComponents(laneId);

    // Rewrite each snapped Version's parent to point at the remote head for that component.
    // Bit's Version objects aren't content-addressed — `_hash` is set once and not derived
    // from content — so we can mutate `parents` in place. The hash stays the same, so the
    // build artifacts referenced from the Version remain valid and the lane's component head
    // doesn't need to be re-pointed. The remote receives the updated Version because our
    // first failed export attempt was rejected during the export-validate step (via
    // `sources.mergeLane`'s same-id/different-hash guard) — *before* `ExportPersist` writes any
    // files to disk — so the remote doesn't yet have this hash and won't dedupe-skip it during
    // transfer.
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
      // Re-point only the lane-lineage parent (the first parent — the predecessor snap on the
      // lane) to the remote head, preserving any additional parents. A snap produced after
      // `syncConfigFromMain` is a merge snap whose second parent links to main's head; overwriting
      // the whole array with `[remoteHead]` would silently drop that merge edge and corrupt the
      // lane's ancestry.
      version.parents = [remoteHead, ...version.parents.slice(1)];
      const afterParents = version.parents.map((p) => p.toString().slice(0, 9)).join(',');
      this.logger.console(
        chalk.blue(
          `Rebasing ${snap.id.toString()}@${snap.head.toString().slice(0, 9)}: parents [${beforeParents}] → [${afterParents}]`
        )
      );
      repo.add(version);

      // Keep the local VersionHistory in sync with the rewritten parents. The first (failed)
      // export already traversed and wrote VersionHistory with this version's *original* parent;
      // without this update the re-export's diverge computation reads that stale history, never
      // sees the remote head as an ancestor, and can send the wrong version set or throw a
      // spurious "no common snap" error. `updateRebasedVersionHistory` only touches the entry if
      // this version already exists in the history (it does, from that first traversal).
      const modelComponent = await legacyScope.getModelComponent(snap.id);
      const versionHistory = await modelComponent.updateRebasedVersionHistory(repo, [version]);
      if (versionHistory) repo.add(versionHistory);
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
   * Export with retry on lane hash-mismatch, caused by a concurrent `bit ci pr` run pushing the
   * same lane id between our pre-export delete and the hub's merge (the export takes 1-2 minutes,
   * plenty of time to race). Used by the default (temp-lane) flow. On mismatch we delete the
   * remote lane and retry — the temp-lane flow recreates the lane on every run anyway, so there's
   * no lane history to preserve. (The `--keep-lane` flow instead adopts the remote lane and
   * rebases onto it; see `exportWithAdoptOnConflict`.)
   */
  private async exportWithRetryOnLaneHashMismatch(laneIdStr: string, maxAttempts = 3) {
    const isHashMismatchErr = (err: any) => (err?.message || err?.toString() || '').includes(LANE_HASH_MISMATCH_MARKER);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.exporter.export();
      } catch (e: any) {
        if (!isHashMismatchErr(e) || attempt === maxAttempts) throw e;
        this.logger.console(
          chalk.yellow(
            `Export attempt ${attempt}/${maxAttempts} failed with lane hash mismatch on "${laneIdStr}" (likely a concurrent CI push). Deleting remote lane and retrying.`
          )
        );
        try {
          await this.archiveLane(laneIdStr, true);
        } catch (archiveErr: any) {
          // Preserve the original export error - rethrowing the archive error would hide the real
          // reason the push was rejected.
          this.logger.console(
            chalk.yellow(
              `Failed to delete remote lane "${laneIdStr}" while recovering from hash mismatch: ${archiveErr?.message || archiveErr}. Rethrowing the original export error.`
            )
          );
          if (e && typeof e === 'object' && (e as any).cause == null) {
            (e as any).cause = archiveErr;
          }
          throw e;
        }
      }
    }
    throw new Error(`exportWithRetryOnLaneHashMismatch: exhausted ${maxAttempts} attempts for lane ${laneIdStr}`);
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
