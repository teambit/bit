/** @flow */
import chalk from 'chalk';
import fs from 'fs-extra';
import Command from '../../command';

const { MODULES_CACHE_DIR } = require('../../../constants');

export default class ClearCache extends Command {
  name = 'clear-cache';
  description = 'clears Bit\'s cache from current working machine';
  alias = 'cc';
  opts = [];
  loader = false;

  action(): Promise<any> {
    fs.removeSync(MODULES_CACHE_DIR);
    fs.mkdirsSync(MODULES_CACHE_DIR);
    return Promise.resolve();
  }

  report(): string {
    return chalk.green('Cache was cleared');
  }
}
