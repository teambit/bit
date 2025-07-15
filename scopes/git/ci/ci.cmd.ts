import type { Command, CommandOptions } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';

export class CiCmd implements Command {
  name = 'ci <sub-command>';
  description = 'CI commands';
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
