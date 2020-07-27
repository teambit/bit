import chalk from 'chalk';
import { Command, CommandOptions } from '../cli';
import { Workspace } from '../workspace';
import { BuilderExtension } from './builder.extension';
import { Reporter } from '../reporter';
import { LogPublisher } from '../types';
import loader from '../../cli/loader';

export class BuilderCmd implements Command {
  name = 'run [pattern]';
  description = 'run set of tasks for build';
  alias = '';
  group = '';
  private = true;
  shortDescription = '';
  options = [] as CommandOptions;

  constructor(
    private builder: BuilderExtension,
    private workspace: Workspace,
    private logger: LogPublisher,
    private reporter: Reporter
  ) {}

  async report([userPattern]: [string]): Promise<string> {
    this.reporter.start();
    const longProcessLogger = this.logger.createLongProcessLogger('build');
    const pattern = userPattern && userPattern.toString();
    const components = pattern ? await this.workspace.byPattern(pattern) : await this.workspace.list();
    const results = await this.builder.build(components);
    longProcessLogger.end();
    loader.stopAndPersist();
    this.reporter.end();
    // @todo: decide about the output
    results.forEach((
      result // eslint-disable-next-line no-console
    ) => console.log('result', `Env: ${result.env}\nResult: success`));

    return chalk.green('the build has been completed');
  }
}
