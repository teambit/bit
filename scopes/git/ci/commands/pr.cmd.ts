import type { Command, CommandOptions } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import { OutsideWorkspaceError, type Workspace } from '@teambit/workspace';
import type { CiMain } from '../ci.main.runtime';

type Options = {
  message?: string;
  build?: boolean;
  lane?: string;
  strict?: boolean;
  dryRun?: boolean;
  keepLane?: boolean;
  skipCleanup?: boolean;
  skipTasks?: string;
};

export class CiPrCmd implements Command {
  name = 'pr';
  description = 'Exports a feature lane to Bit Cloud when a Pull Request is opened or updated.';
  extendedDescription = `Resolves the lane name from --lane or the current Git branch, validates it, and runs install, status, snap, and export. By default it then restores the workspace by switching back to main; pass --skip-cleanup to skip that restore when the workspace is about to be discarded (e.g. an ephemeral CI container). PR builds run the full pipeline by default; to trade specific tasks for speed on a given PR, add a [skip-tasks: ...] token to the commit message (e.g. [skip-tasks: GeneratePreview,ExtractSchema]), which merges with any --skip-tasks flag. Use in pull-request CI pipelines after tests and before deploy.`;
  group = 'collaborate';

  options: CommandOptions = [
    ['m', 'message <message>', 'If set, set it as the snap message, if not, try and grab from git-commit-message'],
    ['l', 'lane <lane>', 'If set, use as the lane name, if not available, grab from git-branch name'],
    ['b', 'build', 'Set to true to build the app locally, false (default) will build on Ripple CI'],
    ['s', 'strict', 'Set to true to fail on warnings as well as errors, false (default) only fails on errors'],
    ['d', 'dry-run', 'Run the full pipeline but skip exporting to remote (build runs only if --build is set)'],
    [
      '',
      'keep-lane',
      'Reuse the same remote lane across PR commits (preserves lane history and cloud UI edits) instead of recreating it on every run',
    ],
    [
      '',
      'skip-cleanup',
      'Skip restoring the workspace (switching back to main) after export. Use when the workspace is discarded right after, e.g. an ephemeral CI container',
    ],
    [
      '',
      'skip-tasks <tasks>',
      `Comma-separated list of build/publish task names (or aspect-ids) to skip during snap, e.g. "ExtractSchema,GeneratePreview,GenerateEnvTemplate,PublishComponents". Speeds up PR builds by trading optional artifacts (schema/preview) and publishing for build time; they are produced on the final export to main`,
    ],
  ];

  constructor(
    private workspace: Workspace,
    private logger: Logger,
    private ci: CiMain
  ) {}

  async report(args: unknown, options: Options) {
    this.logger.console('\n\n');
    this.logger.console('🚀 Initializing PR command');
    if (!this.workspace) throw new OutsideWorkspaceError();

    let laneIdStr: string;
    let message: string;

    if (options.lane) {
      laneIdStr = options.lane;
    } else {
      const currentBranch = await this.ci.getBranchName().catch((e) => {
        throw new Error(`Failed to get branch name from Git: ${e.toString()}`);
      });
      if (!currentBranch) {
        throw new Error('Failed to get branch name');
      }
      laneIdStr = this.ci.convertBranchToLaneId(currentBranch);
    }

    if (options.message) {
      message = options.message;
    } else {
      const commitMessage = await this.ci.getGitCommitMessage();
      if (!commitMessage) {
        throw new Error('Failed to get commit message');
      }
      message = commitMessage;
    }

    const results = await this.ci.snapPrCommit({
      laneIdStr: laneIdStr,
      message,
      build: options.build,
      strict: options.strict,
      dryRun: options.dryRun,
      keepLane: options.keepLane,
      skipCleanup: options.skipCleanup,
      skipTasks: options.skipTasks,
    });

    if (results) {
      return results;
    }

    return `PR command executed successfully`;
  }
}
