import chalk from 'chalk';

import { diff } from '../../../api/consumer';
import { WILDCARD_HELP } from '../../../constants';
import { DiffResults } from '../../../consumer/component-ops/components-diff';
import { Group } from '../../command-groups';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

export default class Diff implements LegacyCommand {
  name = 'diff [values...]';
  shortDescription = 'show diff between components files';
  group: Group = 'development';
  description = `show diff between components files
  bit diff => compare all modified components to their model version
  bit diff [ids...] => compare the specified components against their modified states
  bit diff [id] [version] => compare the specified version to used or modified files
  bit diff [id] [version] [to_version] => compare the specified version files to to_version files
  ${WILDCARD_HELP('diff')}`;
  alias = '';
  opts = [
    ['v', 'verbose', 'show a more verbose output when possible'],
    ['t', 'table', 'show tables instead of plain text for dependencies diff'],
  ] as CommandOptions;
  loader = true;

  action(
    [values]: [string[]],
    { verbose = false, table = false }: { verbose?: boolean; table: boolean }
  ): Promise<DiffResults[]> {
    return diff(values, verbose, table);
  }

  report(diffResults: DiffResults[]): string {
    return diffResults
      .map((diffResult) => {
        if (diffResult.hasDiff) {
          const titleStr = `showing diff for ${chalk.bold(diffResult.id.toStringWithoutVersion())}`;
          const titleSeparator = new Array(titleStr.length).fill('-').join('');
          const title = chalk.cyan(`${titleSeparator}\n${titleStr}\n${titleSeparator}`);
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          const filesWithDiff = diffResult.filesDiff.filter((file) => file.diffOutput);
          const files = filesWithDiff.map((fileDiff) => fileDiff.diffOutput).join('\n');
          const fields = diffResult.fieldsDiff ? diffResult.fieldsDiff.map((field) => field.diffOutput).join('\n') : '';
          return `${title}\n${files}\n${fields}`;
        }
        return `no diff for ${chalk.bold(diffResult.id.toString())}`;
      })
      .join('\n\n');
  }
}
