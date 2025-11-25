// eslint-disable-next-line max-classes-per-file
import type { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import padRight from 'pad-right';
import { CACHE_GLOBALS_ENV } from '@teambit/legacy.constants';
import type { GlobalConfigMain } from './global-config.main.runtime';

export class GlobalsCmd implements Command {
  name = 'globals';
  description = 'display global directories and paths used by Bit';
  extendedDescription = `shows all global directories including cache, logs, and config locations used by Bit across your system.
useful for debugging and understanding where Bit stores data.`;
  group = 'system';
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

    const title = `the following global directories are used by Bit. to change the global root directory, set the "${CACHE_GLOBALS_ENV}" environment variable`;

    return `${title}\n\n${values}`;
  }

  async json() {
    return this.globalConfig.getKnownGlobalDirs();
  }
}
