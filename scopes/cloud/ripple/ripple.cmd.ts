import type { Command, CommandOptions } from '@teambit/cli';

export class RippleCmd implements Command {
  name = 'ripple <sub-command>';
  description = 'manage Ripple CI jobs on bit.cloud';
  extendedDescription = 'view, retry, and manage Ripple CI jobs that build your components in the cloud after export.';
  group = 'collaborate';
  skipWorkspace = true;
  remoteOp = true;

  options: CommandOptions = [];
  commands: Command[] = [];

  async report() {
    return { code: 1, data: '[ripple] please specify a subcommand. See --help for available commands.' };
  }
}
