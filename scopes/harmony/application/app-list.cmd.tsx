import { Command, CommandOptions } from '@teambit/cli';
// import { Logger } from '@teambit/logger';
import chalk from 'chalk';
import { CLITable } from '@teambit/cli-table';
import { ApplicationMain } from './application.main.runtime';

/**
 * @deprecated use AppListCmd class
 */
export class AppListCmdDeprecated implements Command {
  name = 'app-list';
  description = 'DEPRECATED. use "bit app list"';
  alias = '';
  private = true;
  group = 'apps';
  options = [['j', 'json', 'return the component data in json format']] as CommandOptions;

  constructor(private applicationAspect: ApplicationMain) {}

  async report(args: [string], { json }: { json: boolean }) {
    const apps = await this.applicationAspect.listApps();
    if (json) return JSON.stringify(apps, null, 2);
    const deprecationStr = `this command is deprecated. please use "bit app list" instead\n`;
    // eslint-disable-next-line no-console
    console.log(chalk.red());
    if (!apps.length) return chalk.yellow(`${deprecationStr}no apps found`);

    const rows = apps.map((app) => {
      return [app.name];
    });

    const table = new CLITable([], rows);
    return deprecationStr + table.render();
  }
}
