// eslint-disable-next-line max-classes-per-file
import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import padRight from 'pad-right';
import { CACHE_GLOBALS_ENV } from '@teambit/legacy/dist/constants';
import { GlobalConfigMain } from './global-config.main.runtime';

export class GlobalsCmd implements Command {
  name = 'globals';
  description = `list all globals`;
  group = 'workspace';
  helpUrl = 'reference/config/config-files';
  alias = '';
  options = [['j', 'json', 'json format']] as CommandOptions;

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

    const title = `the following globals are used by Bit. to change the global root dir, use "${CACHE_GLOBALS_ENV}" env variable`;

    return `${title}\n\n${values}`;
  }

  async json() {
    return this.globalConfig.getKnownGlobalDirs();
  }
}
