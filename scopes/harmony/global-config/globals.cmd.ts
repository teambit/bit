// eslint-disable-next-line max-classes-per-file
import type { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import padRight from 'pad-right';
import { CACHE_GLOBALS_ENV } from '@teambit/legacy.constants';
import type { GlobalConfigMain } from './global-config.main.runtime';
import { globalsCommand } from './global-config.commands';

export class GlobalsCmd implements Command {
  name = globalsCommand.name;
  description = globalsCommand.description;
  extendedDescription = globalsCommand.extendedDescription;
  group = globalsCommand.group;
  helpUrl = globalsCommand.helpUrl;
  alias = globalsCommand.alias;
  options = globalsCommand.options;

  constructor(private globalConfig: GlobalConfigMain) {}

  async report() {
    const list = await this.json();
    const leftCol = Object.keys(list);
    const padMax = Math.max(...leftCol.map((c) => c.length)) + 1;
    const values = Object.keys(list)
      .map((key) => {
        const keyPadded = padRight(key, padMax, ' ');
        return `${chalk.green(keyPadded)} ${list[key]}`;
      })
      .join('\n');

    const title = `the following global directories are used by Bit. to change the global root directory, set the "${CACHE_GLOBALS_ENV}" environment variable`;

    return `${title}\n\n${values}`;
  }

  async json() {
    return this.globalConfig.getKnownGlobalDirs();
  }
}
