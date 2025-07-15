import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { GitMain } from './git.main.runtime';

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
      return chalk.green('git merge driver was successfully set');
    }
    return chalk.red('git merge driver was not set');
  }
}
