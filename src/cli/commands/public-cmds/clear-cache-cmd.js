/** @flow */
import chalk from 'chalk';
import fs from 'fs-extra';
import roadRunner from 'roadrunner';
import Command from '../../command';

const { BASE_DOCS_DOMAIN, MODULES_CACHE_DIR, MODULES_CACHE_FILENAME, BIT_VERSION } = require('../../../constants');

export default class ClearCache extends Command {
  name = 'clear-cache';
  description = `clears bit's cache from current working machine\n  https://${BASE_DOCS_DOMAIN}/docs/cli-clear-cache.html`;
  alias = 'cc';
  opts = [];
  loader = false;

  action(): Promise<any> {
    fs.removeSync(MODULES_CACHE_DIR);
    fs.mkdirsSync(MODULES_CACHE_DIR);
    roadRunner.reset(MODULES_CACHE_FILENAME);
    roadRunner.set('CACHE_BREAKER', { version: BIT_VERSION });
    return Promise.resolve();
  }

  report(): string {
    return chalk.green('cache cleared');
  }
}
