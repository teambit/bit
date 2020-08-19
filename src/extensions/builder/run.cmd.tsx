import chalk from 'chalk';
import { Command, CommandOptions } from '../cli';
import { Workspace } from '../workspace';
import { Logger } from '../logger';
import { ConsumerNotFound } from '../../consumer/exceptions';
import { BuilderMain } from './builder.main.runtime';

export class BuilderCmd implements Command {
  name = 'build [pattern]';
  description = 'run set of tasks for build';
  alias = '';
  group = '';
  private = true;
  shortDescription = '';
  options = [] as CommandOptions;

  constructor(private builder: BuilderMain, private workspace: Workspace, private logger: Logger) {}

  async report([userPattern]: [string]): Promise<string> {
    const longProcessLogger = this.logger.createLongProcessLogger('build');
    const pattern = userPattern && userPattern.toString();
    if (!this.workspace) throw new ConsumerNotFound();
    const components = pattern ? await this.workspace.byPattern(pattern) : await this.workspace.list();
    const results = await this.builder.build(components);
    longProcessLogger.end();
    this.logger.consoleSuccess();

    return chalk.green(`the build has been completed. total: ${results.length} environments`);
  }
}
