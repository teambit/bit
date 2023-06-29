import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { GitMergerMain } from './git-merger.main.runtime';

const COMMAND_NAME = 'set-git-merge-driver';

type SetGitMergeDriverFlags = {
  global?: boolean;
};

export class SetGitMergeDriverCmd implements Command {
  name = COMMAND_NAME;
  alias = 'gmd';
  description = `setup bit's git merge driver for bitmap files`;
  options = [['g', 'global', 'set the git merge driver globally']] as CommandOptions;
  group = 'development';
  commands: Command[] = [];
  // helpUrl = '';

  constructor(private gitMerger: GitMergerMain) {}

  async report(_args, flags: SetGitMergeDriverFlags) {
    const res = await this.gitMerger.setGitMergeDriver(flags);
    if (res) {
      return chalk.green('git merge driver was successfully set');
    }
    return chalk.red('git merge driver was not set');
  }
}
