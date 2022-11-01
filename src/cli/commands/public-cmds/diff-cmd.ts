import { diff } from '../../../api/consumer';
import { WILDCARD_HELP } from '../../../constants';
import { DiffResults, outputDiffResults } from '../../../consumer/component-ops/components-diff';
import { Group } from '../../command-groups';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

export default class Diff implements LegacyCommand {
  name = 'diff [values...]';
  group: Group = 'development';
  description = "show the diff between the components' source files and config";
  helpUrl = 'docs/components/merging-changes#compare-component-snaps';
  extendedDescription = `bit diff => compare all modified components to their model version
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
    [values = []]: [string[]],
    { verbose = false, table = false }: { verbose?: boolean; table: boolean }
  ): Promise<DiffResults[]> {
    return diff(values, verbose, table);
  }

  report(diffResults: DiffResults[]): string {
    return outputDiffResults(diffResults);
  }
}
