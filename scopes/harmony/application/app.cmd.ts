// eslint-disable-next-line max-classes-per-file
import type { Command, CommandOptions } from '@teambit/cli';
// import { Logger } from '@teambit/logger';
import chalk from 'chalk';
import { CLITable } from '@teambit/cli-table';
import type { ApplicationMain } from './application.main.runtime';

export class AppListCmd implements Command {
  name = 'list';
  description = 'list all registered apps';
  alias = '';
  group = 'run-serve';
  helpUrl = 'reference/reference/cli-reference';
  options = [['j', 'json', 'return the component data in json format']] as CommandOptions;

  constructor(private applicationAspect: ApplicationMain) {}

  async report() {
    const idsAndNames = await this.applicationAspect.listAppsIdsAndNames();
    if (!idsAndNames.length) return chalk.yellow('no apps found');
    const rows = idsAndNames.map(({ id, name }) => [id, name]);
    const table = new CLITable(['id', 'name'], rows);
    return table.render();
  }

  async json() {
    const idsAndNames = await this.applicationAspect.listAppsIdsAndNames();
    return idsAndNames;
  }
}

export class AppCmd implements Command {
  name = 'app [sub-command]';
  description = 'Manages apps';
  helpUrl = 'docs/getting-started/composing/create-apps';
  alias = 'apps';
  group = 'run-serve';
  commands: Command[] = [];
  options = [] as CommandOptions;

  constructor(private applicationAspect: ApplicationMain) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async report(args: [string]) {
    return new AppListCmd(this.applicationAspect).report();
  }
}
