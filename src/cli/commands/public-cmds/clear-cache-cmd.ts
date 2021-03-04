import chalk from 'chalk';
import fs from 'fs-extra';
// it's a hack, but I didn't find a better way to access the getCacheDir() function
import { __TEST__ as v8CompileCache } from 'v8-compile-cache';
import { loadConsumerIfExist } from '../../../consumer';
import { loadScopeIfExist } from '../../../scope/scope-loader';

import { LegacyCommand } from '../../legacy-command';

const { BASE_DOCS_DOMAIN } = require('../../../constants');

export default class ClearCache implements LegacyCommand {
  name = 'clear-cache';
  description = `clears bit's cache from current working machine\n  https://${BASE_DOCS_DOMAIN}/docs/workspace#cache`;
  alias = 'cc';
  opts = [];
  loader = false;
  skipWorkspace = true;

  async action(): Promise<any> {
    const cacheCleared: string[] = [];
    const cacheDir = v8CompileCache.getCacheDir();
    fs.removeSync(cacheDir);
    cacheCleared.push('v8-compile-cache code');
    const consumer = await loadConsumerIfExist();
    if (consumer) {
      const componentCachePath = consumer.componentFsCache.basePath;
      fs.removeSync(componentCachePath);
      cacheCleared.push('components cache on the filesystem');
    }
    const scope = await loadScopeIfExist();
    if (scope) {
      await scope.objects.scopeIndex.deleteFile();
      cacheCleared.push('scope-index file');
    }
    return cacheCleared;
  }

  report(cacheCleared: string[]): string {
    const title = 'the following cache(s) have been cleared:';
    const output = cacheCleared.map((str) => `  ✔ ${str}`).join('\n');
    return chalk.green(`${chalk.bold(title)}\n${output}`);
  }
}
