import type { RuntimeDefinition } from '@teambit/harmony';
import { CLIAspect, type CLIMain, MainRuntime } from '@teambit/cli';
import { LoggerAspect, type LoggerMain, type Logger } from '@teambit/logger';
import { WorkspaceAspect, type Workspace } from '@teambit/workspace';
import { BuilderAspect, type BuilderMain } from '@teambit/builder';
import { StatusAspect, type StatusMain } from '@teambit/status';
import { LanesAspect, type LanesMain } from '@teambit/lanes';
import { SnappingAspect, SnapResults, tagResultOutput, snapResultOutput, type SnappingMain } from '@teambit/snapping';
import { ExportAspect, type ExportMain } from '@teambit/export';
import { ImporterAspect, type ImporterMain } from '@teambit/importer';
import { CheckoutAspect, type CheckoutMain } from '@teambit/checkout';
import { SwitchLaneOptions } from '@teambit/lanes';
import chalk from 'chalk';
import { CiAspect } from './ci.aspect';
import { CiCmd } from './ci.cmd';
import { CiVerifyCmd } from './commands/verify.cmd';
import { CiPrCmd } from './commands/pr.cmd';
import { CiMergeCmd } from './commands/merge.cmd';
import { git } from './git';

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

    private logger: Logger
  ) {}

  static async provider([
    cli,
    workspace,
    loggerAspect,
    builder,
    status,
    lanes,
    snapping,
    exporter,
    importer,
    checkout,
  ]: [
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
  ]) {
    const logger = loggerAspect.createLogger(CiAspect.id);
    const ci = new CiMain(workspace, builder, status, lanes, snapping, exporter, importer, checkout, logger);
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

  private async verifyWorkspaceStatusInternal(strict: boolean = false) {
    this.logger.console('📊 Workspace Status');
    this.logger.console(chalk.blue('Verifying status of workspace'));
    const status = await this.status.status({
      lanes: true,
      ignoreCircularDependencies: false,
    });

    // Check for blocking issues (errors) vs warnings
    const componentsWithErrors = status.componentsWithIssues.filter(({ issues }) => issues.hasTagBlockerIssues());

    const componentsWithWarnings = status.componentsWithIssues.filter(({ issues }) => !issues.hasTagBlockerIssues());

    if (componentsWithWarnings.length > 0) {
      if (strict) {
        this.logger.console(
          chalk.red(
            `Found ${componentsWithWarnings.length} components with warnings (strict mode), run 'bit status' to see the warnings.`
          )
        );
        return { code: 1, data: '', status };
      } else {
        this.logger.console(
          chalk.yellow(
            `Found ${componentsWithWarnings.length} components with warnings, run 'bit status' to see the warnings.`
          )
        );
      }
    }

    if (componentsWithErrors.length > 0) {
      this.logger.console(
        chalk.red(`Found ${componentsWithErrors.length} components with errors, run 'bit status' to see the errors.`)
      );
      return { code: 1, data: '', status };
    }

    this.logger.console(chalk.green('Workspace status is correct'));
    return { code: 0, data: '', status };
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
    const { code, data } = await this.verifyWorkspaceStatusInternal();
    if (code !== 0) return { code, data };

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

    const { code, data } = await this.verifyWorkspaceStatusInternal(strict);
    if (code !== 0) return { code, data };

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

  async mergePr({ message: argMessage, build, strict }: { message?: string; build?: boolean; strict?: boolean }) {
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
    await git.pull('origin', defaultBranch);
    this.logger.console(chalk.green('Pulled latest git changes'));

    this.logger.console('🔄 Checking out to main head');
    await this.checkout.checkout({
      forceOurs: true,
      head: true,
      skipNpmInstall: true,
    });

    const { code, data, status } = await this.verifyWorkspaceStatusInternal(strict);
    if (code !== 0) return { code, data };

    const hasSoftTaggedComponents = status.softTaggedComponents.length > 0;

    this.logger.console('📦 Component Operations');
    this.logger.console(chalk.blue('Tagging components'));
    const tagResults = await this.snapping.tag({
      all: true,
      message,
      build,
      failFast: true,
      persist: hasSoftTaggedComponents,
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

      // Commit the .bitmap and pnpm-lock.yaml files using Git
      await git.add(['.bitmap', 'pnpm-lock.yaml']);
      await git.commit('chore: update .bitmap and lockfiles as needed [skip ci]');

      // Pull latest changes and push the commit to the remote repository
      await git.pull('origin', defaultBranch);
      await git.push('origin', defaultBranch);
    } else {
      this.logger.console(chalk.yellow('No components were tagged, skipping export and git operations'));
    }

    this.logger.console(chalk.green('Merged PR'));

    if (currentLane) {
      this.logger.console('🗑️ Lane Cleanup');
      const laneId = currentLane.id;
      this.logger.console(chalk.blue(`Archiving lane ${laneId.toString()}`));
      const archiveLane = await this.lanes.removeLanes([laneId()]);
      if (archiveLane) {
        this.logger.console(chalk.green('Lane archived'));
      } else {
        this.logger.console(chalk.yellow('Failed to archive lane'));
      }
    }

    return { code: 0, data: '' };
  }
}

// @ts-ignore
CiAspect.addRuntime(CiMain);
