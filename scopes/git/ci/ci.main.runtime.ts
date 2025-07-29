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
import execa from 'execa';
import chalk from 'chalk';
import type { ReleaseType } from 'semver';
import { CiAspect } from './ci.aspect';
import { CiCmd } from './ci.cmd';
import { CiVerifyCmd } from './commands/verify.cmd';
import { CiPrCmd } from './commands/pr.cmd';
import { CiMergeCmd } from './commands/merge.cmd';
import { git } from './git';

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
    await this.lanes
      .switchLanes(laneName, {
        forceOurs: true,
        head: true,
        workspaceOnly: true,
        skipDependencyInstallation: true,
        ...options,
      })
      .catch((e) => {
        if (e.toString().includes('already checked out')) {
          this.logger.console(chalk.yellow(`Lane ${laneName} already checked out, skipping checkout`));
          return true;
        }
        this.logger.console(chalk.red(`Failed to checkout lane ${laneName}: ${e.toString()}`));
        return null;
      });
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
  }: {
    laneIdStr: string;
    message: string;
    build: boolean | undefined;
    strict: boolean | undefined;
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
    const availableLanesInScope = await this.lanes
      .getLanes({
        remote: laneId.scope,
      })
      .catch((e) => {
        throw new Error(`Failed to get lanes in scope ${laneId.scope}: ${e.toString()}`);
      });

    const laneExists = availableLanesInScope.find((lane) => lane.id.name === laneId.name);

    let foundErr: Error | undefined;
    try {
      if (laneExists) {
        const lane = await this.lanes.importLaneObject(laneId, true);
        this.workspace.consumer.setCurrentLane(laneId, true);
        const laneIds = lane.toComponentIds();
        laneIds.forEach((compId) => this.workspace.consumer.bitMap.updateComponentId(compId));
        await this.workspace.bitMap.write();
        await this.importer.importCurrentObjects();

        this.logger.console(chalk.green(`Imported lane ${laneId.toString()}`));
      } else {
        this.logger.console(chalk.blue(`Creating lane ${laneId.toString()}`));

        try {
          await this.lanes.createLane(laneId.name, {
            scope: laneId.scope,
            forkLaneNewScope: true,
          });
        } catch (e: any) {
          if (e.message.includes('already exists')) {
            this.logger.console(chalk.yellow(`Lane ${laneId.toString()} already exists, skipping creation`));
          } else {
            throw new Error(`Failed to create lane ${laneId.toString()}: ${e.toString()}`);
          }
        }
      }

      const currentLane = await this.lanes.getCurrentLane();

      this.logger.console(chalk.blue(`Current lane: ${currentLane?.name ?? 'main'}`));

      if (currentLane?.name === laneId.name) {
        this.logger.console(chalk.yellow(`Current lane is already ${laneId.name}, skipping switch`));
      } else {
        await this.switchToLane(laneId.toString());
      }

      this.logger.console('📦 Snapping Components');
      const results = await this.snapping.snap({
        message,
        build,
        exitOnFirstFailedTask: true,
      });

      if (!results) {
        return 'No changes detected, nothing to snap';
      }

      const { snappedComponents }: SnapResults = results;

      const snapOutput = snapResultOutput(results);
      this.logger.console(snapOutput);

      this.logger.console(chalk.blue(`Exporting ${snappedComponents.length} components`));

      const exportResults = await this.exporter.export();

      this.logger.console(chalk.green(`Exported ${exportResults.componentsIds.length} components`));
    } catch (e: any) {
      foundErr = e;
      throw e;
    } finally {
      if (foundErr) {
        this.logger.console(chalk.red(`Found error: ${foundErr.message}`));
      }
      // Whatever happens, switch back to the original lane
      this.logger.console('🔄 Cleanup');
      this.logger.console(chalk.blue(`Switching back to ${originalLane?.name ?? 'main'}`));
      const lane = await this.lanes.getCurrentLane();
      if (!lane) {
        this.logger.console(chalk.yellow('Already on main, no need to switch. Checking out to head'));
        await this.lanes.checkout.checkout({
          head: true,
          skipNpmInstall: true,
        });
      } else {
        await this.switchToLane(originalLane?.name ?? 'main');
      }
    }
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
  }: {
    message?: string;
    build?: boolean;
    strict?: boolean;
    releaseType: ReleaseType;
    preReleaseId?: string;
    incrementBy?: number;
    explicitVersionBump?: boolean;
    verbose?: boolean;
  }) {
    const message = argMessage || (await this.getGitCommitMessage());
    if (!message) {
      throw new Error('Failed to get commit message from git. Please provide a message using --message option.');
    }

    const currentLane = await this.lanes.getCurrentLane();
    if (currentLane) {
      // this doesn't normally happen. we expect this mergePr to be called from the default branch, which normally checks
      // out to main lane.
      this.logger.console(chalk.blue(`Currently on lane ${currentLane.name}, switching to main`));
      await this.switchToLane('main');
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
      forceOurs: true,
      head: true,
      skipNpmInstall: true,
    };
    const checkoutResults = await this.checkout.checkout(checkoutProps);
    await this.workspace.bitMap.write('checkout head');
    this.logger.console(checkoutOutput(checkoutResults, checkoutProps));

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

      this.logger.console('🔄 Git Operations');
      // Set user.email and user.name
      await git.addConfig('user.email', 'bit-ci[bot]@bit.cloud');
      await git.addConfig('user.name', 'Bit CI');

      // Check git status before commit
      const statusBeforeCommit = await git.status();
      this.logger.console(chalk.blue(`Git status before commit: ${statusBeforeCommit.files.length} files`));
      statusBeforeCommit.files.forEach((file) => {
        this.logger.console(chalk.gray(`  ${file.working_dir}${file.index} ${file.path}`));
      });

      // Show git diff if there are uncommitted changes
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

      // Previously we committed only .bitmap and pnpm-lock.yaml files.
      // However, it's possible that "bit checkout head" we did above, modified other files as well.
      // So now we commit all files that were changed.
      await git.add(['.']);

      const commitMessage = await this.getCustomCommitMessage();
      await git.commit(commitMessage);

      // Check git status after commit
      const statusAfterCommit = await git.status();
      this.logger.console(chalk.blue(`Git status after commit: ${statusAfterCommit.files.length} files`));
      statusAfterCommit.files.forEach((file) => {
        this.logger.console(chalk.gray(`  ${file.working_dir}${file.index} ${file.path}`));
      });

      await git.pull('origin', defaultBranch, { '--rebase': 'true' });
      await git.push('origin', defaultBranch);
    } else {
      this.logger.console(chalk.yellow('No components were tagged, skipping export and git operations'));
    }

    this.logger.console(chalk.green('Merged PR'));

    if (currentLane) {
      this.logger.console('🗑️ Lane Cleanup');
      const laneId = currentLane.id();
      this.logger.console(chalk.blue(`Archiving lane ${laneId}`));
      // force means to remove the lane even if it was not merged. in this case, we don't care much because main already has the changes.
      const archiveLane = await this.lanes.removeLanes([laneId], { remote: true, force: true });
      if (archiveLane.length) {
        this.logger.console(chalk.green('Lane archived'));
      } else {
        this.logger.console(chalk.yellow('Failed to archive lane'));
      }
    }

    return { code: 0, data: '' };
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

// @ts-ignore
CiAspect.addRuntime(CiMain);
