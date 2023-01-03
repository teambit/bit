import chalk from 'chalk';
import { DEFAULT_LANE } from '@teambit/lane-id';
import { Command, CommandOptions } from '@teambit/cli';
import { BitError } from '@teambit/bit-error';
import { MergeLanesMain } from './merge-lanes.main.runtime';

type Flags = {
  pattern?: string;
  push?: boolean;
  keepReadme?: boolean;
  noSquash: boolean;
  includeDeps?: boolean;
};

/**
 * private command. the underscore prefix is intended.
 */
export class MergeLaneFromScopeCmd implements Command {
  name = '_merge-lane <from-lane> [to-lane]';
  description = `merge a remote lane into another lane or main via a bare-scope (not workspace)`;
  extendedDescription = `to merge from a workspace, use "bit lane merge" command.
this is intended to use from the UI, which will have a button to merge an existing lane.
the lane must be up-to-date with the other lane, otherwise, conflicts might occur which are not handled in this command`;
  arguments = [
    {
      name: 'from-lane',
      description: 'lane-id to merge from',
    },
    {
      name: 'to-lane',
      description: `lane-id to merge to. default is "${DEFAULT_LANE}"`,
    },
  ];
  alias = '';
  options = [
    ['', 'pattern <string>', 'partially merge the lane with the specified component-pattern'],
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
    [fromLane, toLane]: [string, string],
    { pattern, push = false, keepReadme = false, noSquash = false, includeDeps = false }: Flags
  ): Promise<string> {
    if (includeDeps && !pattern) {
      throw new BitError(`"--include-deps" flag is relevant only for --pattern flag`);
    }

    const { mergedNow, mergedPreviously, exportedIds } = await this.mergeLanes.mergeFromScope(
      fromLane,
      toLane || DEFAULT_LANE,
      {
        push,
        keepReadme,
        noSquash,
        pattern,
        includeDeps,
      }
    );

    const mergedTitle = chalk.green(
      `successfully merged ${mergedNow.length} components from ${fromLane} to ${toLane || DEFAULT_LANE}`
    );
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
    [fromLane, toLane]: [string, string],
    { pattern, push = false, keepReadme = false, noSquash = false, includeDeps = false }: Flags
  ) {
    if (includeDeps && !pattern) {
      throw new BitError(`"--include-deps" flag is relevant only for --pattern flag`);
    }
    let results: any;
    try {
      results = await this.mergeLanes.mergeFromScope(fromLane, toLane || DEFAULT_LANE, {
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
