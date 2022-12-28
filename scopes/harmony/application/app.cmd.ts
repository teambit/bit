// eslint-disable-next-line max-classes-per-file
import { Command, CommandOptions } from '@teambit/cli';
// import { Logger } from '@teambit/logger';
import chalk from 'chalk';
import { CLITable } from '@teambit/cli-table';
import { ApplicationMain } from './application.main.runtime';

export class AppListCmd implements Command {
  name = 'list';
  description = 'list all registered apps';
  alias = '';
  group = 'apps';
  helpUrl = 'reference/reference/cli-reference';
  options = [['j', 'json', 'return the component data in json format']] as CommandOptions;

  constructor(private applicationAspect: ApplicationMain) {}

  async report(args: [string], { json }: { json: boolean }) {
    const appComponents = await this.applicationAspect.mapApps();
    if (json) return JSON.stringify(appComponents, null, 2);
    if (!appComponents.length) return chalk.yellow('no apps found');

    const rows = appComponents.flatMap(([id, apps]) => {
      return apps.map((app) => [id, app.name]);
    });

    const table = new CLITable(['id', 'name'], rows);
    return table.render();
  }
}

export class AppCmd implements Command {
  name = 'app <sub-command>';
  description = 'Manages apps';
  helpUrl = 'docs/getting-started/composing/create-apps';
  alias = '';
  group = 'apps';
  commands: Command[] = [];
  options = [] as CommandOptions;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async report(args: [string]) {
    // it should never be here. Yargs throws an error before reaching this method.
    return `Please specify a sub-command`;
  }
}
