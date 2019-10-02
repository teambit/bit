/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { diff } from '../../../api/consumer';
import type { DiffResults } from '../../../consumer/component-ops/components-diff';
import { WILDCARD_HELP } from '../../../constants';

export default class Diff extends Command {
  name = 'diff [values...]';
  description = `show diff between components files
  bit diff => compare all modified components to their model version
  bit diff [ids...] => compare the specified components against their modified states
  bit diff [id] [version] => compare the specified version to used or modified files
  bit diff [id] [version] [to_version] => compare the specified version files to to_version files
  ${WILDCARD_HELP('diff')}`;
  alias = '';
  opts = [['v', 'verbose', 'show a more verbose output when possible']];
  loader = true;

  action([values]: [string[]], { verbose = false }: { verbose?: boolean }): Promise<DiffResults[]> {
    return diff(values, verbose);
  }

  report(diffResults: DiffResults[]): string {
    return diffResults
      .map((diffResult) => {
        if (diffResult.hasDiff) {
          const titleStr = `showing diff for ${chalk.bold(diffResult.id.toStringWithoutVersion())}`;
          const titleSeparator = new Array(titleStr.length).fill('-').join('');
          const title = chalk.cyan(`${titleSeparator}\n${titleStr}\n${titleSeparator}`);
          // $FlowFixMe
          const filesWithDiff = diffResult.filesDiff.filter(file => file.diffOutput);
          const files = filesWithDiff.map(fileDiff => fileDiff.diffOutput).join('\n');
          const fields = diffResult.fieldsDiff ? diffResult.fieldsDiff.map(field => field.diffOutput).join('\n') : '';
          return `${title}\n${files}\n${fields}`;
        }
        return `no diff for ${chalk.bold(diffResult.id.toString())}`;
      })
      .join('\n\n');
  }
}
