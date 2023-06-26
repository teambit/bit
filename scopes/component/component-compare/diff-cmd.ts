import { Command, CommandOptions } from '@teambit/cli';
import { WILDCARD_HELP } from '@teambit/legacy/dist/constants';
import { DiffResults, outputDiffResults } from '@teambit/legacy/dist/consumer/component-ops/components-diff';
import { ComponentCompareMain } from './component-compare.main.runtime';

export class DiffCmd implements Command {
  name = 'diff [values...]';
  group = 'development';
  description = "show the diff between the components' source files and config";
  helpUrl = 'docs/components/merging-changes#compare-component-snaps';
  extendedDescription = `bit diff => compare all modified components to their model version
bit diff [ids...] => compare the specified components against their modified states
bit diff [id] [version] => compare the specified version to used or modified files
bit diff [id] [version] [to_version] => compare the specified version files to to_version files
${WILDCARD_HELP('diff')}`;
  alias = '';
  options = [
    ['v', 'verbose', 'show a more verbose output when possible'],
    ['t', 'table', 'show tables instead of plain text for dependencies diff'],
  ] as CommandOptions;
  loader = true;

  constructor(private componentCompareMain: ComponentCompareMain) {}

  async report([values = []]: [string[]], { verbose = false, table = false }: { verbose?: boolean; table: boolean }) {
    const diffResults: DiffResults[] = await this.componentCompareMain.diffByCLIValues(values, verbose, table);
    return outputDiffResults(diffResults);
  }
}
