import chalk from 'chalk';
import { clearCache } from '../../../api/consumer';
import { LegacyCommand } from '../../legacy-command';
import { BASE_DOCS_DOMAIN } from '../../../constants';

export default class ClearCache implements LegacyCommand {
  name = 'clear-cache';
  description = `clears bit's cache from current working machine\n  https://${BASE_DOCS_DOMAIN}/troubleshooting/doctor-logs-cache/#cache`;
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
