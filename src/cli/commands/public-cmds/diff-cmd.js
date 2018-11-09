/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { diff } from '../../../api/consumer';
import type { DiffResults } from '../../../consumer/component-ops/components-diff';

export default class Diff extends Command {
  name = 'diff [values...]';
  description = `show diff between components files
  bit diff => compare all modified components to their model version
  bit diff [ids...] => compare the specified components against their modified states
  bit diff [id] [version] => compare the specified version to used or modified files
  bit diff [id] [version] [to_version] => compare the specified version files to to_version files
  the id can be used with wildcards (e.g. bit diff "utils/*")`;
  alias = '';
  opts = [];
  loader = true;

  action([values]: [string[]]): Promise<DiffResults[]> {
    return diff(values);
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
