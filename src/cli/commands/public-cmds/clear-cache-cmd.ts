/** @flow */
import chalk from 'chalk';
import fs from 'fs-extra';
// it's a hack, but I didn't find a better way to access the getCacheDir() function
import { __TEST__ as v8CompileCache } from 'v8-compile-cache';
import Command from '../../command';

const { BASE_DOCS_DOMAIN } = require('../../../constants');

export default class ClearCache extends Command {
  name = 'clear-cache';
  description = `clears bit's cache from current working machine\n  https://${BASE_DOCS_DOMAIN}/docs/cli-clear-cache.html`;
  alias = 'cc';
  opts = [];
  loader = false;

  action(): Promise<any> {
    const cacheDir = v8CompileCache.getCacheDir();
    fs.removeSync(cacheDir);
    return Promise.resolve();
  }

  report(): string {
    return chalk.green('cache cleared');
  }
}
