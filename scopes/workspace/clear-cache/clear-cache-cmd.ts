import type { Command, CommandOptions } from '@teambit/cli';
import { formatTitle, formatItem, formatSuccessSummary, errorSymbol, joinSections, successSymbol } from '@teambit/cli';
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
        return formatSuccessSummary(`cleaned the cache of "${remote}"`);
      }
      return `${errorSymbol} failed cleaning the cache of "${remote}"`;
    }
    const { succeed, failed: failedCaches } = await this.clearCache.clearCache();
    const getSuccessOutput = () => {
      if (!succeed.length) return '';
      const items = succeed.map((str) => formatItem(str, successSymbol()));
      return `${formatTitle('caches cleared')}\n${items.join('\n')}`;
    };
    const getFailedOutput = () => {
      if (!failedCaches.length) return '';
      const items = failedCaches.map((str) => formatItem(str, errorSymbol));
      return `${errorSymbol} ${formatTitle('caches failed to clear')}\n${items.join('\n')}`;
    };
    return joinSections([getSuccessOutput(), getFailedOutput()]);
  }
}
