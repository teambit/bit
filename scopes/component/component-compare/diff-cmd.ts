import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { WILDCARD_HELP } from '@teambit/legacy/dist/constants';
import { DiffResults, outputDiffResults } from '@teambit/legacy/dist/consumer/component-ops/components-diff';
import { ComponentCompareMain } from './component-compare.main.runtime';

export class DiffCmd implements Command {
  name = 'diff [values...]';
  group = 'development';
  description =
    "show the diff between the components' current source files and config, and their latest snapshot or tag";
  helpUrl = 'docs/components/merging-changes#compare-component-snaps';
  extendedDescription = `bit diff => compare all modified components to their model version
bit diff [ids...] => compare the specified components against their modified states
bit diff [id] [version] => compare component's current files and configs to the specified version of the component
bit diff [id] [version] [to_version] => compare component's files and configs between the specified version and the to_version provided
${WILDCARD_HELP('diff')}`;
  alias = '';
  options = [
    ['v', 'verbose', 'show a more verbose output where possible'],
    ['t', 'table', 'show tables instead of plain text for dependencies diff'],
  ] as CommandOptions;
  loader = true;

  constructor(private componentCompareMain: ComponentCompareMain) {}

  async report([values = []]: [string[]], { verbose = false, table = false }: { verbose?: boolean; table: boolean }) {
    const diffResults: DiffResults[] = await this.componentCompareMain.diffByCLIValues(values, verbose, table);
    if (!diffResults.length) {
      return chalk.yellow('there are no modified components to diff');
    }
    return outputDiffResults(diffResults);
  }
}
