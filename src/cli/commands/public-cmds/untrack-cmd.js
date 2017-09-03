/** @flow */
import chalk from 'chalk';
import path from 'path';
import Command from '../../command';
import { untrack } from '../../../api/consumer';

export default class Untrack extends Command {
  name = 'untrack <files...>';
  description = 'untrack new components/files';
  alias = 'u';
  opts = [];
  loader = true;

  action([paths]: [string[]]): Promise<*> {
    return untrack(paths);
  }

  report(results: Array<{ id: string, files: string[] }>): string {
    if (results.length > 1) {
      return chalk.green(`tracking ${results.length} new components`);
    }

    return results.map((result) => {
      if (result.files.length === 0) {
        return chalk.underline.red(`could not track component ${chalk.bold(result.id)}: no files to track`);
      }
      const title = chalk.underline(`tracking component ${chalk.bold(result.id)}:\n`);
      const files = result.files.map(file => chalk.green(`added ${file.relativePath}`));
      return title + files.join('\n');
    }).join('\n\n');
  }
}
