import type { Command, CommandOptions } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';

export class CiCmd implements Command {
  name = 'ci <sub-command>';
  description = 'continuous integration commands for automated workflows';
  extendedDescription = 'provides commands designed for use in CI/CD pipelines with Git workflows to automate component development tasks like verification, pull request handling, and deployment preparation.';
  group = 'collaborate';

  options: CommandOptions = [];
  commands: Command[] = [];

  constructor(
    private workspace: Workspace,
    private logger: Logger
  ) {}

  async report() {
    return { code: 1, data: '[ci] not implemented' };
  }
}
