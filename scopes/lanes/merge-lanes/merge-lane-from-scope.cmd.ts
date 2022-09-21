import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { BitError } from '@teambit/bit-error';
import { MergeLanesMain } from './merge-lanes.main.runtime';

/**
 * private command. the underscore prefix is intended.
 */
export class MergeLaneFromScopeCmd implements Command {
  name = '_merge-lane <lane> [pattern]';
  description = `merge a remote lane into main via a bare-scope (not workspace)`;
  extendedDescription = `to merge from a workspace, use "bit lane merge" command.
this is intended to use from the UI, which will have a button to merge an existing lane into main.
the lane must be up-to-date with main, otherwise, conflicts might occur which are not handled in this command`;
  arguments = [
    {
      name: 'lane',
      description: 'lane-id to merge to main',
    },
    {
      name: 'pattern',
      description: 'EXPERIMENTAL. partially merge the lane with the specified component-pattern',
    },
  ];
  alias = '';
  options = [
    ['', 'push', 'export the updated objects to the original scopes once done'],
    ['', 'keep-readme', 'skip deleting the lane readme component after merging'],
    ['', 'no-squash', 'EXPERIMENTAL. relevant for merging lanes into main, which by default squash.'],
    // ['', 'verbose', 'show details of components that were not merged legitimately'],
    ['', 'include-deps', 'EXPERIMENTAL. relevant for "--pattern". merge also dependencies of the given components'],
  ] as CommandOptions;
  loader = true;
  private = true;
  migration = true;
  remoteOp = true;

  constructor(private mergeLanes: MergeLanesMain) {}

  async report(
    [name, pattern]: [string, string],
    {
      push = false,
      keepReadme = false,
      noSquash = false,
      includeDeps = false,
    }: // verbose = false,
    {
      push?: boolean;
      keepReadme?: boolean;
      noSquash: boolean;
      includeDeps?: boolean;
      // verbose?: boolean;
    }
  ): Promise<string> {
    if (includeDeps && !pattern) {
      throw new BitError(`"--include-deps" flag is relevant only for --pattern flag`);
    }
    const { mergedNow, mergedPreviously } = await this.mergeLanes.mergeFromScope(name, {
      push,
      keepReadme,
      noSquash,
      pattern,
      includeDeps,
    });

    const mergedTitle = chalk.green(`successfully merged ${mergedNow.length} components from ${name} to main`);
    const mergedOutput = mergedNow.length ? `${mergedTitle}\n${mergedNow.join('\n')}` : '';

    const nonMergedTitle = chalk.bold(
      `the following ${mergedPreviously.length} components were already merged before, they were left intact`
    );
    const nonMergedOutput = mergedPreviously.length ? `${nonMergedTitle}\n${mergedPreviously.join('\n')}` : '';

    return `${mergedOutput}\n${nonMergedOutput}`;
  }
}
