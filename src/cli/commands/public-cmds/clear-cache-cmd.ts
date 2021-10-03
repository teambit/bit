import chalk from 'chalk';
import { clearCache } from '../../../api/consumer';
import { LegacyCommand } from '../../legacy-command';
import { BASE_DOCS_DOMAIN } from '../../../constants';
import { Group } from '../../command-groups';

export default class ClearCache implements LegacyCommand {
  name = 'clear-cache';
  shortDescription = "clears Bit's cache from current working machine";
  group: Group = 'general';
  description = `clears bit's cache from current working machine.
The following gets removed by this command:
1) V8 compiled code (generated the first time Bit is loaded by v8-compile-cache package)
2) components cache on the filesystem (mainly the dependencies graph and docs)
3) scope's index file, which maps the component-id:object-hash
https://${BASE_DOCS_DOMAIN}/docs/workspace#cache`;
  alias = 'cc';
  opts = [];
  loader = false;
  skipWorkspace = true;

  async action(): Promise<string[]> {
    return clearCache();
  }

  report(cacheCleared: string[]): string {
    const title = 'the following cache(s) have been cleared:';
    const output = cacheCleared.map((str) => `  ✔ ${str}`).join('\n');
    return chalk.green(`${chalk.bold(title)}\n${output}`);
  }
}
