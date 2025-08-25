import type { Command, CommandOptions } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import { OutsideWorkspaceError, type Workspace } from '@teambit/workspace';
import type { CiMain } from '../ci.main.runtime';

type Options = {
  message?: string;
  build?: boolean;
  lane?: string;
  strict?: boolean;
};

export class CiPrCmd implements Command {
  name = 'pr';
  description = 'Exports a feature lane to Bit Cloud when a Pull Request is opened or updated.';
  extendedDescription = `Resolves the lane name from --lane or the current Git branch, validates it, and runs install, status, snap, and export. Cleans up by switching back to main. Use in pull-request CI pipelines after tests and before deploy.`;
  group = 'collaborate';

  options: CommandOptions = [
    ['m', 'message <message>', 'If set, set it as the snap message, if not, try and grab from git-commit-message'],
    ['l', 'lane <lane>', 'If set, use as the lane name, if not available, grab from git-branch name'],
    ['b', 'build', 'Set to true to build the app locally, false (default) will build on Ripple CI'],
    ['s', 'strict', 'Set to true to fail on warnings as well as errors, false (default) only fails on errors'],
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
    });

    if (results) {
      return results;
    }

    return `PR command executed successfully`;
  }
}
