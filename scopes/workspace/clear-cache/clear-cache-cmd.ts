import type { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import type { ClearCacheMain } from './clear-cache.main.runtime';

export default class ClearCacheCmd implements Command {
  name = 'clear-cache';
  description = 'remove cached data to resolve stale data issues';
  group = 'system';
  extendedDescription: string;
  alias = 'cc';
  options = [['r', 'remote <remote-name>', 'clear memory cache from a remote scope']] as CommandOptions;
  loader = false;
  skipWorkspace = true;
  helpUrl = 'reference/workspace/clearing-cache';

  constructor(private clearCache: ClearCacheMain) {
    this.extendedDescription = `clears various caches that Bit uses to improve performance. useful when experiencing stale data issues or
unexpected behavior. this command removes:
1) components cache on the filesystem (mainly the dependencies graph and docs)
2) scope's index file, which maps the component-id:object-hash

note: this cache has minimal impact on disk space. to free significant disk space, use "bit capsule delete --all" to remove build capsules.`;
  }

  async report(arg, { remote }: { remote?: string }): Promise<string> {
    if (remote) {
      const success = await this.clearCache.clearRemoteCache(remote);
      if (success) {
        return chalk.green(`successfully cleaned the cache of "${remote}"`);
      }
      return chalk.red(`failed cleaning the cache of "${remote}"`);
    }
    const { succeed, failed } = await this.clearCache.clearCache();
    const getSuccessOutput = () => {
      if (!succeed.length) return '';
      const title = 'the following cache(s) have been cleared:';
      const output = succeed.map((str) => `  ✔ ${str}`).join('\n');
      return chalk.green(`${chalk.bold(title)}\n${output}`);
    };
    const getFailedOutput = () => {
      if (!failed.length) return '';
      const title = 'the following cache(s) failed to clear:';
      const output = failed.map((str) => `  X ${str}`).join('\n');
      return chalk.red(`${chalk.bold(title)}\n${output}`);
    };
    return `${getSuccessOutput()}\n${getFailedOutput()}`;
  }
}
