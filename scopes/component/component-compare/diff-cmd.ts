import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import { DiffResults, outputDiffResults } from '@teambit/legacy.component-diff';
import { ComponentCompareMain } from './component-compare.main.runtime';

export class DiffCmd implements Command {
  name = 'diff [component-pattern] [version] [to-version]';
  group = 'development';
  description =
    "show the diff between the components' current source files and config, and their latest snapshot or tag";
  helpUrl = 'docs/components/merging-changes#compare-component-snaps';
  arguments = [
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
    {
      name: 'version',
      description: 'specific version to compare against',
    },
    {
      name: 'to-version',
      description: 'specific version to compare to',
    },
  ];
  alias = '';
  options = [
    ['v', 'verbose', 'show a more verbose output where possible'],
    ['t', 'table', 'show tables instead of plain text for dependencies diff'],
  ] as CommandOptions;
  examples = [
    { cmd: 'diff', description: 'show diff for all modified components' },
    { cmd: 'diff foo', description: 'show diff for a component "foo"' },
    { cmd: 'diff foo 0.0.1', description: 'show diff for a component "foo" from the current state to version 0.0.1' },
    { cmd: 'diff foo 0.0.1 0.0.2', description: 'show diff for a component "foo" from version 0.0.1 to version 0.0.2' },
    {
      cmd: "diff '$codeModified' ",
      description: 'show diff only for components with modified files. ignore config changes',
    },
  ];
  loader = true;

  constructor(private componentCompareMain: ComponentCompareMain) {}

  async report(
    [pattern, version, toVersion]: [string, string, string],
    { verbose = false, table = false }: { verbose?: boolean; table: boolean }
  ) {
    const diffResults: DiffResults[] = await this.componentCompareMain.diffByCLIValues(pattern, version, toVersion, {
      verbose,
      table,
    });
    if (!diffResults.length) {
      return chalk.yellow('there are no modified components to diff');
    }
    return outputDiffResults(diffResults);
  }
}
