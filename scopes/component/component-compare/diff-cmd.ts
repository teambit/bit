import chalk from 'chalk';
import type { Command, CommandOptions } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import type { DiffResults } from '@teambit/legacy.component-diff';
import { outputDiffResults } from '@teambit/legacy.component-diff';
import type { ComponentCompareMain } from './component-compare.main.runtime';

export class DiffCmd implements Command {
  name = 'diff [component-pattern] [version] [to-version]';
  group = 'info-analysis';
  description = 'compare component changes between versions or against the current workspace';
  extendedDescription = `shows a detailed diff of component files, dependencies, and configuration changes. 
by default, compares workspace changes against the latest version. specify versions to compare historical changes.
supports pattern matching to filter components and various output formats for better readability.`;
  helpUrl = 'docs/components/merging-changes#compare-component-snaps';
  arguments = [
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
    {
      name: 'version',
      description: `the base version to compare from. if omitted, compares the workspace's current files to the component's latest version.`,
    },
    {
      name: 'to-version',
      description: `the target version to compare against "version".
if both "version" and "to-version" are provided, compare those two versions directly (ignoring the workspace).`,
    },
  ];
  alias = '';
  options = [
    ['p', 'parent', 'compare the specified "version" to its immediate parent instead of comparing to the current one'],
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
    {
      cmd: 'diff foo 0.0.2 --parent',
      description: 'compare "foo@0.0.2" to its parent version. showing what changed in 0.0.2',
    },
  ];
  loader = true;

  constructor(private componentCompareMain: ComponentCompareMain) {}

  async report(
    [pattern, version, toVersion]: [string, string, string],
    { verbose = false, table = false, parent }: { verbose?: boolean; table: boolean; parent?: boolean }
  ) {
    const diffResults: DiffResults[] = await this.componentCompareMain.diffByCLIValues(pattern, version, toVersion, {
      verbose,
      table,
      parent,
    });
    if (!diffResults.length) {
      return chalk.yellow('there are no modified components to diff');
    }
    return outputDiffResults(diffResults);
  }
}
