// eslint-disable-next-line max-classes-per-file
import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import padRight from 'pad-right';
import { CACHE_ROOT, DEBUG_LOG, GLOBAL_SCOPE, GLOBAL_CONFIG, CACHE_GLOBALS_ENV } from '@teambit/legacy/dist/constants';

export class GlobalsCmd implements Command {
  name = 'globals';
  description = `list all globals`;
  group = 'workspace';
  alias = '';
  options = [['j', 'json', 'json format']] as CommandOptions;

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

    const title = `the following globals are used by Bit. to change the global root dir, use "${CACHE_GLOBALS_ENV}"" env variable`;

    return `${title}\n\n${values}`;
  }

  async json() {
    return {
      'Global Dir': CACHE_ROOT,
      'Log file': DEBUG_LOG,
      'Global Scope Dir': GLOBAL_SCOPE,
      'Config Dir': GLOBAL_CONFIG,
      'Capsules Dir': '', // populate after PR 4973 is merged.
    };
  }
}
