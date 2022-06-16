import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { Workspace } from './workspace';

export class PatternCommand implements Command {
  name = 'pattern <pattern>';
  alias = '';
  description = 'list the component ids matching the given pattern';
  extendedDescription = `this command helps validating a pattern before using it in other commands.
a pattern can be a simple component-id or component-name. e.g. "ui/button".
a pattern can be used with wildcards for multiple component ids, e.g. "org.scope/utils/**".
to enter multiple patterns, separate them by a comma, e.g. "ui/*, lib/*"
to exclude, use "!". e.g. "ui/**, !ui/button"
always wrap the pattern with quotes to avoid collision with shell commands.
the matching algorithm is done by multimatch (@see https://github.com/sindresorhus/multimatch)
`;

  group = 'development';
  private = false;
  options = [['j', 'json', 'return the output as JSON']] as CommandOptions;

  constructor(private workspace: Workspace) {}

  async report([pattern]: [string]) {
    const ids = await this.json([pattern]);
    const title = chalk.green(`found ${chalk.bold(ids.length.toString())} components matching the pattern`);
    return `${title}\n${ids.join('\n')}`;
  }

  async json([pattern]: [string]) {
    return this.workspace.idsByPattern(pattern, false);
  }
}
