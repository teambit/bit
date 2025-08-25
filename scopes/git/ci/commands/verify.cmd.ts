import type { Command, CommandOptions } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import { OutsideWorkspaceError, type Workspace } from '@teambit/workspace';
import type { CiMain } from '../ci.main.runtime';

export class CiVerifyCmd implements Command {
  name = 'verify';
  description = 'Ensures the workspace passes CI checks on every commit.';
  extendedDescription = `Runs lint, build, and status checks to catch dependency drift or broken builds early. Typically used as a pre-push hook or early CI job. Stops at the first failing step and returns a non-zero exit code.`;
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
