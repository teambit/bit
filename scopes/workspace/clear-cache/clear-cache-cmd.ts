import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { ClearCacheMain } from './clear-cache.main.runtime';

export default class ClearCacheCmd implements Command {
  name = 'clear-cache';
  description = "clears Bit's cache from current working machine";
  group = 'general';
  extendedDescription: string;
  alias = 'cc';
  options = [['r', 'remote <remote-name>', 'clear memory cache from a remote scope']] as CommandOptions;
  loader = false;
  skipWorkspace = true;
  helpUrl = 'reference/workspace/clearing-cache';

  constructor(private clearCache: ClearCacheMain, private docsDomain: string) {
    this.extendedDescription = `The following gets removed by this command:
1) V8 compiled code (generated the first time Bit is loaded by v8-compile-cache package)
2) components cache on the filesystem (mainly the dependencies graph and docs)
3) scope's index file, which maps the component-id:object-hash`;
  }

  async report(arg, { remote }: { remote?: string }): Promise<string> {
    if (remote) {
      const success = await this.clearCache.clearRemoteCache(remote);
      if (success) {
        return chalk.green(`successfully cleaned the cache of "${remote}"`);
      }
      return chalk.red(`failed cleaning the cache of "${remote}"`);
    }
    const cacheCleared = await this.clearCache.clearCache();
    const title = 'the following cache(s) have been cleared:';
    const output = cacheCleared.map((str) => `  ✔ ${str}`).join('\n');
    return chalk.green(`${chalk.bold(title)}\n${output}`);
  }
}
