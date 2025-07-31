import type { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import type { GitMain } from './git.main.runtime';

const COMMAND_NAME = 'merge-bitmaps';

// - `%O`: ancestor’s version of the conflicting file
// - `%A`: current version of the conflicting file
// - `%B`: other branch's version of the conflicting file

export class MergeBitmapsCmd implements Command {
  name = `${COMMAND_NAME} <ancestor> <current> <other>`;
  alias = '';
  description = `a special command to merge conflicting bitmap files during git merge`;
  options = [] as CommandOptions;
  group = 'workspace-tools';
  commands: Command[] = [];
  private = true;
  // helpUrl = '';

  constructor(private git: GitMain) {}

  async report([ancestor, current, other]: string[]) {
    const res = await this.git.mergeBitmaps(ancestor, current, other);
    if (res) {
      return chalk.green('git merge driver was successfully set');
    }
    return chalk.red('git merge driver was not set');
  }
}
