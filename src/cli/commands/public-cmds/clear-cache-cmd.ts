import chalk from 'chalk';
import fs from 'fs-extra';
// it's a hack, but I didn't find a better way to access the getCacheDir() function
import { __TEST__ as v8CompileCache } from 'v8-compile-cache';
import { LegacyCommand } from '../../legacy-command';

const { BASE_DOCS_DOMAIN } = require('../../../constants');

export default class ClearCache implements LegacyCommand {
  name = 'clear-cache';
  description = `clears bit's cache from current working machine\n  https://${BASE_DOCS_DOMAIN}/docs/workspace#cache`;
  alias = 'cc';
  opts = [];
  loader = false;
  skipWorkspace = true;

  action(): Promise<any> {
    const cacheDir = v8CompileCache.getCacheDir();
    fs.removeSync(cacheDir);
    return Promise.resolve();
  }

  report(): string {
    return chalk.green('cache cleared');
  }
}
