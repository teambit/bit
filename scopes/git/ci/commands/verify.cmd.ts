import type { Command, CommandOptions } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import { OutsideWorkspaceError, type Workspace } from '@teambit/workspace';
import { CiMain } from '../ci.main.runtime';

export class CiVerifyCmd implements Command {
  name = 'verify';
  description = 'CI commands';
  group = 'development';

  options: CommandOptions = [];

  constructor(
    private workspace: Workspace,
    private logger: Logger,
    private ci: CiMain
  ) {}

  async report() {
    this.logger.console('\n\n🚀 Initializing Verify command');
    if (!this.workspace) throw new OutsideWorkspaceError();

    return this.ci.verifyWorkspaceStatus();
  }
}
