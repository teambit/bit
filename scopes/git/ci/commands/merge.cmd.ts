import type { Command, CommandOptions } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import { OutsideWorkspaceError, type Workspace } from '@teambit/workspace';
import { CiMain } from '../ci.main.runtime';

type Options = {
  message?: string;
  build?: boolean;
};

export class CiMergeCmd implements Command {
  name = 'merge';
  description = 'Merges a PR';
  group = 'collaborate';

  options: CommandOptions = [
    ['m', 'message <message>', 'If set, use it as the snap message, if not, try and grab from git-commit-message'],
    ['b', 'build', 'Set to true to build the app locally, false (default) will build on Ripple CI'],
  ];

  constructor(
    private workspace: Workspace,
    private logger: Logger,
    private ci: CiMain
  ) {}

  async report(args: unknown, options: Options) {
    this.logger.console('\n\n');
    this.logger.console('🚀 Initializing Merge command');
    if (!this.workspace) throw new OutsideWorkspaceError();

    return this.ci.mergePr({ message: options.message, build: options.build });
  }
}
