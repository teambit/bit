import type { Command, CommandOptions } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import { OutsideWorkspaceError, type Workspace } from '@teambit/workspace';
import type { CiMain } from '../ci.main.runtime';

type Options = {
  message?: string;
  build?: boolean;
  lane?: string;
};

export class CiPrCmd implements Command {
  name = 'pr';
  description = 'This command is meant to run when a PR was open/updated and meant to export a lane to bit-cloud.';
  group = 'collaborate';

  options: CommandOptions = [
    ['m', 'message <message>', 'If set, set it as the snap message, if not, try and grab from git-commit-message'],
    ['l', 'lane <lane>', 'If set, use as the lane name, if not available, grab from git-branch name'],
    ['b', 'build', 'Set to true to build the app locally, false (default) will build on Ripple CI'],
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

    let branch: string;
    let message: string;

    if (options.lane) {
      branch = options.lane;
    } else {
      const currentBranch = await this.ci.getBranchName().catch((e) => {
        throw new Error(`Failed to get branch name from Git: ${e.toString()}`);
      });
      if (!currentBranch) {
        throw new Error('Failed to get branch name');
      }
      branch = `${this.workspace.defaultScope}/${currentBranch}`;
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

    return this.ci.snapPrCommit({
      branch,
      message,
      build: options.build,
    });
  }
}
