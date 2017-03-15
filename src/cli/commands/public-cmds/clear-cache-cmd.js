/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import fs from 'fs-extra';

const { MODULES_CACHE_DIR } = require('../../../constants');

export default class ClearCache extends Command {
  name = 'clear-cache';
  description = 'Clears the modules cache folder';
  alias = 'cc';
  opts = [];
  loader = false;
  
  action(): Promise<any> {
    fs.removeSync(MODULES_CACHE_DIR);
    fs.mkdirsSync(MODULES_CACHE_DIR);
    return Promise.resolve();
  }

  report(): string {
    return chalk.green(`Cache was cleared`);
  }
}
