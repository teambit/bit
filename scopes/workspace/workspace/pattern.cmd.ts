import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { Workspace } from '../workspace';

export class PatternCommand implements Command {
  name = 'pattern <pattern>';
  alias = '';
  description = 'list the component ids matching the given pattern';
  group = 'development';
  private = false;
  options = [['j', 'json', 'return the output as JSON']] as CommandOptions;

  constructor(private workspace: Workspace) {}

  async report([pattern]: [string]) {
    const ids = await this.workspace.idsByPattern(pattern);
    const title = chalk.green(`found ${chalk.bold(ids.length.toString())} components matching the pattern`);
    return `${title}\n${ids.join('\n')}`;
  }

  async json([pattern]: [string]) {
    return this.workspace.idsByPattern(pattern);
  }
}
