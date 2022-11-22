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
    ['', 'include-deps', 'EXPERIMENTAL. relevant for "--pattern". merge also dependencies of the given components'],
    ['j', 'json', 'output as json format'],
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
    }: {
      push?: boolean;
      keepReadme?: boolean;
      noSquash: boolean;
      includeDeps?: boolean;
    }
  ): Promise<string> {
    if (includeDeps && !pattern) {
      throw new BitError(`"--include-deps" flag is relevant only for --pattern flag`);
    }
    const { mergedNow, mergedPreviously, exportedIds } = await this.mergeLanes.mergeFromScope(name, {
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
    const nonMergedOutput = mergedPreviously.length ? `\n${nonMergedTitle}\n${mergedPreviously.join('\n')}` : '';

    const exportedTitle = chalk.green(`successfully exported ${exportedIds.length} components`);
    const exportedOutput = exportedIds.length ? `\n${exportedTitle}\n${exportedIds.join('\n')}` : '';

    return mergedOutput + nonMergedOutput + exportedOutput;
  }
  async json(
    [name, pattern]: [string, string],
    {
      push = false,
      keepReadme = false,
      noSquash = false,
      includeDeps = false,
    }: {
      push?: boolean;
      keepReadme?: boolean;
      noSquash: boolean;
      includeDeps?: boolean;
    }
  ) {
    if (includeDeps && !pattern) {
      throw new BitError(`"--include-deps" flag is relevant only for --pattern flag`);
    }
    let results: any;
    try {
      results = await this.mergeLanes.mergeFromScope(name, {
        push,
        keepReadme,
        noSquash,
        pattern,
        includeDeps,
      });
      return {
        code: 0,
        data: results,
      };
    } catch (err: any) {
      return {
        code: 1,
        error: err.message,
      };
    }
  }
}
