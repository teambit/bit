import type { Command, CommandOptions } from '@teambit/cli';
import { formatSuccessSummary, errorSymbol } from '@teambit/cli';
import type { GitMain } from './git.main.runtime';

const COMMAND_NAME = 'set-merge-driver';

type SetGitMergeDriverFlags = {
  global?: boolean;
};

export class SetGitMergeDriverCmd implements Command {
  name = COMMAND_NAME;
  alias = 'smd';
  description = `setup bit's git merge driver for bitmap files`;
  options = [['g', 'global', 'set the git merge driver globally']] as CommandOptions;
  group = 'workspace-tools';
  commands: Command[] = [];
  // helpUrl = '';

  constructor(private git: GitMain) {}

  async report(_args, flags: SetGitMergeDriverFlags) {
    const res = await this.git.setGitMergeDriver(flags);
    if (res) {
      return formatSuccessSummary('git merge driver was set');
    }
    return `${errorSymbol} git merge driver was not set`;
  }
}
