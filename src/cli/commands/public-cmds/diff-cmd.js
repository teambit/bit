/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { diff } from '../../../api/consumer';
import type { DiffResults } from '../../../consumer/component-ops/components-diff';

export default class Diff extends Command {
  name = 'diff [ids...]';
  description = 'show diff between tagged components files and current components files';
  alias = '';
  opts = [];
  loader = true;

  action([ids]: [string[]]): Promise<DiffResults[]> {
    return diff(ids);
  }

  report(diffResults: DiffResults[]): string {
    return diffResults
      .map((diffResult) => {
        if (diffResult.hasDiff) {
          const title = chalk.green(`showing diff for ${chalk.bold(diffResult.id.toString())}`);
          // $FlowFixMe
          const files = diffResult.filesDiff.map(fileDiff => fileDiff.diffOutput).join('\n');
          return `${title}\n${files}`;
        }
        return chalk.red(`no diff for ${chalk.bold(diffResult.id.toString())}`);
      })
      .join('\n\n');
  }
}
